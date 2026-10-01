import assert from "node:assert/strict";
import test from "node:test";

import {
  BrivyaError,
  type ActionRequest,
  type ApprovalRecord,
  type CapabilityContract,
} from "@brivya/core";
import {
  RulePolicyEngine,
  deny,
  requireApproval,
} from "@brivya/policy";

import {
  ApprovalVerifier,
  AuditFactory,
  BusinessRuntime,
  CapabilityRegistry,
  DefaultAuthorizer,
  FunctionConnectorExecutor,
  InMemoryAuditSink,
  InMemoryEventSink,
  InMemoryIdempotencyStore,
  InMemoryTransactionStore,
  approvalInputDigest,
  type ExecutionResult,
} from "../src/index.js";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const now = () => new Date(NOW);
const future = "2026-10-01T01:00:00.000Z";

function capability(
  overrides: Partial<CapabilityContract> = {},
): CapabilityContract {
  return {
    id: "order.create",
    version: "0.1.0",
    description: "Create an order.",
    resource: "order",
    mode: "mutation",
    execution: "sync",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sku"],
      properties: {
        sku: { type: "string", minLength: 1 },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["orderId"],
      properties: {
        orderId: { type: "string", minLength: 1 },
      },
    },
    risk: "high",
    approval: "required",
    permissions: ["order:create"],
    idempotency: { required: true },
    timeoutMs: 5_000,
    ...overrides,
  };
}

function request(
  overrides: Partial<ActionRequest<{ sku: string }>> = {},
): ActionRequest<{ sku: string }> {
  return {
    requestId: "req-1",
    capability: "order.create",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["order:create"],
      expiresAt: future,
    },
    input: { sku: "coffee" },
    idempotencyKey: "idem-1",
    correlationId: "corr-1",
    ...overrides,
  };
}

function approval(
  contract: CapabilityContract,
  action: ActionRequest,
  approverId = "manager-1",
): ApprovalRecord {
  return {
    requestId: action.requestId,
    capability: contract.id,
    inputDigest: approvalInputDigest(contract, action),
    approver: {
      type: "user",
      id: approverId,
    },
    expiresAt: future,
  };
}

function harness(options: {
  contract?: CapabilityContract;
  policy?: RulePolicyEngine;
  connector?: FunctionConnectorExecutor;
} = {}) {
  const contract = options.contract ?? capability();
  const registry = new CapabilityRegistry();
  registry.register(contract);

  const audit = new InMemoryAuditSink();
  const events = new InMemoryEventSink();
  const transactions = new InMemoryTransactionStore({
    now,
    idFactory: () => "tx-1",
  });
  const idempotency =
    new InMemoryIdempotencyStore<ExecutionResult>();
  const auditFactory = new AuditFactory({
    now,
    idFactory: (() => {
      let id = 0;
      return () => `evt-${++id}`;
    })(),
  });

  let connectorCalls = 0;
  let receivedObligations: readonly { type: string }[] = [];

  const connector =
    options.connector ??
    new FunctionConnectorExecutor(async (context) => {
      connectorCalls += 1;
      receivedObligations = context.obligations;
      return { orderId: "order-1" };
    });

  const runtime = new BusinessRuntime({
    registry,
    connector,
    policy: options.policy ?? new RulePolicyEngine(),
    authorizer: new DefaultAuthorizer({ now }),
    approvalVerifier: new ApprovalVerifier({ now }),
    idempotency,
    transactions,
    audit,
    events,
    auditFactory,
  });

  return {
    contract,
    runtime,
    audit,
    events,
    transactions,
    get connectorCalls() {
      return connectorCalls;
    },
    get receivedObligations() {
      return receivedObligations;
    },
  };
}

test("actor identity alone never authorizes a protected capability", async () => {
  const h = harness({
    contract: capability({ approval: "none" }),
  });
  const action = request({
    principal: undefined,
    delegation: undefined,
  });

  await assert.rejects(
    () => h.runtime.execute(action),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "UNAUTHORIZED",
  );

  assert.equal(h.connectorCalls, 0);
  assert.equal(h.audit.records.at(-1)?.errorCode, "UNAUTHORIZED");
});

test("policy deny fails closed before connector execution", async () => {
  const h = harness({
    contract: capability({ approval: "none" }),
    policy: new RulePolicyEngine([
      () => deny("blocked-account", [{ type: "notify_security" }]),
    ]),
  });

  await assert.rejects(
    () => h.runtime.execute(request()),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "POLICY_DENIED",
  );

  assert.equal(h.connectorCalls, 0);
  assert.equal(h.audit.records.at(-1)?.outcome, "denied");
});

test("required approval cannot be bypassed", async () => {
  const h = harness();

  await assert.rejects(
    () => h.runtime.execute(request()),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "APPROVAL_REQUIRED",
  );

  assert.equal(h.connectorCalls, 0);
});

test("approval is bound to the exact capability input digest", async () => {
  const h = harness();
  const action = request();
  const invalidApproval = {
    ...approval(h.contract, action),
    inputDigest: "not-the-current-input-digest",
  };

  await assert.rejects(
    () =>
      h.runtime.execute(action, {
        approvals: [invalidApproval],
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONFLICT" &&
      error.details.reason === "approval_digest_mismatch",
  );

  assert.equal(h.connectorCalls, 0);
});

test("dual control requires two distinct approvers", async () => {
  const contract = capability({ approval: "dual_control" });
  const h = harness({ contract });
  const action = request();

  await assert.rejects(
    () =>
      h.runtime.execute(action, {
        approvals: [approval(contract, action, "manager-1")],
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "APPROVAL_REQUIRED",
  );

  const result = await h.runtime.execute(action, {
    approvals: [
      approval(contract, action, "manager-1"),
      approval(contract, action, "manager-2"),
    ],
  });

  assert.equal(result.output.orderId, "order-1");
  assert.equal(h.connectorCalls, 1);
});

test("policy obligations reach the connector and successful execution is audited", async () => {
  const h = harness({
    policy: new RulePolicyEngine([
      () =>
        requireApproval("manager-review", [
          { type: "capture_reason" },
          { type: "limit_channel", channel: "online" },
        ]),
    ]),
  });
  const action = request();

  const result = await h.runtime.execute(action, {
    approvals: [approval(h.contract, action)],
  });

  assert.equal(result.replayed, false);
  assert.equal(result.transaction.status, "succeeded");
  assert.deepEqual(
    h.receivedObligations.map((item) => item.type),
    ["capture_reason", "limit_channel"],
  );
  assert.equal(h.audit.records.at(-1)?.outcome, "succeeded");
  assert.equal(h.events.events.at(-1)?.type, "brivya.action.succeeded");
});

test("same idempotency key and request replays without executing the connector twice", async () => {
  const h = harness();
  const action = request();
  const approvals = [approval(h.contract, action)];

  const first = await h.runtime.execute(action, { approvals });
  const second = await h.runtime.execute(action, { approvals });

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(first.transaction.id, second.transaction.id);
  assert.equal(h.connectorCalls, 1);
  assert.equal(h.audit.records.at(-1)?.outcome, "replayed");
});

test("same idempotency key cannot be reused for changed input", async () => {
  const contract = capability({ approval: "none" });
  const h = harness({ contract });

  await h.runtime.execute(request({ input: { sku: "coffee" } }));

  await assert.rejects(
    () =>
      h.runtime.execute(
        request({
          requestId: "req-2",
          input: { sku: "tea" },
        }),
      ),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONFLICT" &&
      error.details.reason === "idempotency_digest_mismatch",
  );

  assert.equal(h.connectorCalls, 1);
});

test("invalid connector output fails the transaction and remains auditable", async () => {
  const h = harness({
    connector: new FunctionConnectorExecutor(async () => ({
      unexpected: true,
    })),
  });
  const action = request();

  await assert.rejects(
    () =>
      h.runtime.execute(action, {
        approvals: [approval(h.contract, action)],
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONNECTOR_ERROR" &&
      error.details.reason === "output_schema_invalid",
  );

  assert.equal(h.audit.records.at(-1)?.errorCode, "CONNECTOR_ERROR");
  assert.equal(h.events.events.at(-1)?.type, "brivya.action.failed");
  assert.equal(
    (await h.transactions.get("tx-1"))?.status,
    "failed",
  );
});

test("connector exceptions become structured CONNECTOR_ERROR failures", async () => {
  const h = harness({
    connector: new FunctionConnectorExecutor(async () => {
      throw new Error("upstream unavailable");
    }),
  });
  const action = request();

  await assert.rejects(
    () =>
      h.runtime.execute(action, {
        approvals: [approval(h.contract, action)],
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONNECTOR_ERROR",
  );

  assert.equal(
    (await h.transactions.get("tx-1"))?.status,
    "failed",
  );
  assert.equal(h.audit.records.at(-1)?.errorCode, "CONNECTOR_ERROR");
});

test("capability registry requires an explicit version when multiple versions exist", () => {
  const registry = new CapabilityRegistry();
  registry.register(capability({ version: "0.1.0" }));
  registry.register(capability({ version: "0.2.0" }));

  assert.throws(
    () => registry.resolve("order.create"),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONFLICT",
  );

  assert.equal(
    registry.resolve("order.create", "0.2.0").version,
    "0.2.0",
  );
});
