import assert from "node:assert/strict";
import test from "node:test";

import type {
  ActionRequest,
  ApprovalRecord,
  CapabilityContract,
} from "@brivya/core";
import { RulePolicyEngine, deny } from "@brivya/policy";
import {
  ApprovalVerifier,
  BusinessRuntime,
  CapabilityRegistry,
  DefaultAuthorizer,
  FunctionConnectorExecutor,
  InMemoryIdempotencyStore,
  InMemoryTransactionStore,
  approvalInputDigest,
  type ExecutionResult,
} from "@brivya/runtime";

import {
  RestAdapter,
  type RestSecurityContext,
} from "../src/index.js";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const FUTURE = "2026-10-01T01:00:00.000Z";
const now = () => new Date(NOW);

function contract(): CapabilityContract {
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
  };
}

function security(
  capability: CapabilityContract,
  input: { sku: string },
  overrides: Partial<RestSecurityContext> = {},
): RestSecurityContext {
  const action: ActionRequest = {
    requestId: "req-1",
    capability: capability.id,
    capabilityVersion: capability.version,
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["order:create"],
      expiresAt: FUTURE,
    },
    input,
    idempotencyKey: "idem-1",
  };

  const approval: ApprovalRecord = {
    requestId: action.requestId,
    capability: capability.id,
    inputDigest: approvalInputDigest(capability, action),
    approver: { type: "user", id: "manager-1" },
    expiresAt: FUTURE,
  };

  return {
    actor: action.actor,
    principal: action.principal,
    delegation: action.delegation,
    approvals: [approval],
    ...overrides,
  };
}

function harness(
  policy = new RulePolicyEngine(),
) {
  const capability = contract();
  const registry = new CapabilityRegistry();
  registry.register(capability);

  let calls = 0;
  const runtime = new BusinessRuntime({
    registry,
    policy,
    authorizer: new DefaultAuthorizer({ now }),
    approvalVerifier: new ApprovalVerifier({ now }),
    idempotency:
      new InMemoryIdempotencyStore<ExecutionResult>(),
    transactions: new InMemoryTransactionStore({
      now,
      idFactory: () => "tx-rest-1",
    }),
    connector: new FunctionConnectorExecutor(async () => {
      calls += 1;
      return { orderId: "order-1" };
    }),
  });

  const adapter = new RestAdapter(runtime, {
    generateRequestId: () => "req-1",
  });

  return {
    adapter,
    capability,
    get calls() {
      return calls;
    },
  };
}

function request(
  input: { sku: string },
  idempotencyKey = "idem-1",
) {
  return {
    method: "POST",
    path: "/v0alpha1/capabilities/order.create/execute",
    headers: {
      "X-Brivya-Capability-Version": "0.1.0",
      "Idempotency-Key": idempotencyKey,
      "X-Correlation-Id": "corr-rest-1",
    },
    body: { input },
  };
}

test("REST adapter invokes the canonical runtime and preserves correlation metadata", async () => {
  const h = harness();
  const input = { sku: "coffee" };

  const response = await h.adapter.handle(
    request(input),
    security(h.capability, input),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    data: { orderId: "order-1" },
    meta: {
      transactionId: "tx-rest-1",
      replayed: false,
      correlationId: "corr-rest-1",
    },
  });
  assert.equal(
    response.headers["x-brivya-transaction-id"],
    "tx-rest-1",
  );
  assert.equal(h.calls, 1);
});

test("REST body cannot self-assert principal or delegation", async () => {
  const h = harness();

  const response = await h.adapter.handle(
    {
      ...request({ sku: "coffee" }),
      body: {
        input: { sku: "coffee" },
        principal: { type: "user", id: "forged" },
        delegation: {
          type: "oauth",
          scopes: ["order:create"],
        },
      },
    },
    {
      actor: { type: "agent", id: "agent-1" },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(
    (response.body as {
      error: { code: string };
    }).error.code,
    "UNAUTHORIZED",
  );
  assert.equal(h.calls, 0);
});

test("REST adapter cannot bypass runtime approval requirements", async () => {
  const h = harness();
  const input = { sku: "coffee" };
  const trusted = security(h.capability, input, {
    approvals: [],
  });

  const response = await h.adapter.handle(
    request(input),
    trusted,
  );

  assert.equal(response.status, 428);
  assert.equal(
    (response.body as {
      error: { code: string };
    }).error.code,
    "APPROVAL_REQUIRED",
  );
  assert.equal(h.calls, 0);
});

test("REST maps policy denial without connector execution", async () => {
  const h = harness(
    new RulePolicyEngine([
      () => deny("blocked-account"),
    ]),
  );
  const input = { sku: "coffee" };

  const response = await h.adapter.handle(
    request(input),
    security(h.capability, input),
  );

  assert.equal(response.status, 403);
  assert.equal(
    (response.body as {
      error: { code: string };
    }).error.code,
    "POLICY_DENIED",
  );
  assert.equal(h.calls, 0);
});

test("REST preserves idempotency replay semantics", async () => {
  const h = harness();
  const input = { sku: "coffee" };
  const trusted = security(h.capability, input);

  const first = await h.adapter.handle(
    request(input),
    trusted,
  );
  const second = await h.adapter.handle(
    request(input),
    trusted,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(
    second.headers["x-brivya-idempotent-replay"],
    "true",
  );
  assert.equal(h.calls, 1);
});

test("REST preserves changed-input idempotency conflicts", async () => {
  const h = harness();

  const firstInput = { sku: "coffee" };
  await h.adapter.handle(
    request(firstInput),
    security(h.capability, firstInput),
  );

  const changedInput = { sku: "tea" };
  const response = await h.adapter.handle(
    request(changedInput),
    security(h.capability, changedInput),
  );

  assert.equal(response.status, 409);
  assert.equal(
    (response.body as {
      error: {
        code: string;
        details: { reason?: string };
      };
    }).error.details.reason,
    "idempotency_digest_mismatch",
  );
  assert.equal(h.calls, 1);
});
