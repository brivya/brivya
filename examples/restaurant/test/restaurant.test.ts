import assert from "node:assert/strict";
import test from "node:test";

import {
  BrivyaError,
  type ActionRequest,
  type ApprovalRecord,
} from "@brivya/core";
import { loadBusinessAgentManifest } from "@brivya/manifest";
import {
  RulePolicyEngine,
  deny,
  requireApproval,
} from "@brivya/policy";
import {
  BusinessRuntime,
  CapabilityRegistry,
  InMemoryAuditSink,
  FunctionConnectorExecutor,
  InMemoryEventSink,
  approvalInputDigest,
} from "@brivya/runtime";
import { RestaurantMockConnector } from "@brivya/connector-mock";
import { RestAdapter } from "@brivya/adapter-rest";
import {
  BrivyaMcpAdapter,
  capabilityToolName,
} from "@brivya/adapter-mcp";

import {
  registerRestaurantCapabilities,
  restaurantManifestYaml,
} from "../src/index.js";

function harness() {
  const registry = new CapabilityRegistry();
  registerRestaurantCapabilities(registry);
  const connector = new RestaurantMockConnector();
  const audit = new InMemoryAuditSink();
  const events = new InMemoryEventSink();
  const runtime = new BusinessRuntime({
    registry,
    connector,
    policy: new RulePolicyEngine(),
    audit,
    events,
  });
  return { registry, connector, audit, events, runtime };
}

test("RST-002 manifest validates and capability refs resolve", () => {
  const h = harness();
  const manifest = loadBusinessAgentManifest(restaurantManifestYaml, {
    capabilityExists: (ref) => {
      try {
        h.registry.resolve(ref.ref, ref.version);
        return true;
      } catch {
        return false;
      }
    },
  });

  assert.equal(manifest.metadata.id, "amina-coffee");
  assert.equal(manifest.capabilities.length, 5);
});

test("RST-004 menu.search returns typed vegetarian available resources without side effects", async () => {
  const h = harness();
  const result = await h.runtime.execute({
    requestId: "req-menu",
    capability: "menu.search",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    input: { query: "vegetarian", available_only: true },
  });

  const output = result.output as { items: Array<{ vegetarian: boolean; available: boolean }> };
  assert.ok(output.items.length > 0);
  assert.ok(output.items.every((item) => item.vegetarian && item.available));
  assert.equal(h.connector.state.orders.size, 0);
  assert.equal(h.connector.state.reservations.size, 0);
});

test("RST-005 availability.check is query-only", async () => {
  const h = harness();
  const result = await h.runtime.execute({
    requestId: "req-avail",
    capability: "availability.check",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    input: { date: "2026-10-03", guests: 2 },
  });

  assert.equal((result.output as { slots: unknown[] }).slots.length, 2);
  assert.equal(h.connector.state.reservations.size, 0);
});

test("RST-007 reservation.create requires delegation and writes mutation state", async () => {
  const h = harness();
  const action: ActionRequest = {
    requestId: "req-res",
    capability: "reservation.create",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["reservation:create"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: {
      guests: 2,
      scheduledTime: {
        dateTime: "2026-10-03T18:00:00+08:00",
        timeZone: "Asia/Singapore",
      },
    },
    idempotencyKey: "idem-res-1",
    correlationId: "corr-res-1",
  };

  const result = await h.runtime.execute(action);
  assert.equal((result.output as { status: string }).status, "confirmed");
  assert.equal(h.connector.state.reservations.size, 1);
  assert.equal(h.audit.records.at(-1)?.outcome, "succeeded");
});

test("RST-008/009/010/011 order.create enforces price, inventory and idempotency", async () => {
  const h = harness();
  const base: ActionRequest = {
    requestId: "req-order",
    capability: "order.create",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["order:create"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: {
      items: [
        {
          itemId: "coffee-1",
          quantity: 2,
          unitPrice: { amount: "6.80", currency: "USD" },
          version: "menu-v1",
        },
      ],
    },
    idempotencyKey: "idem-order-1",
    correlationId: "corr-order-1",
  };

  const first = await h.runtime.execute(base);
  const replay = await h.runtime.execute(base);
  assert.equal((first.output as { total: { amount: string } }).total.amount, "13.60");
  assert.equal(replay.replayed, true);
  assert.equal(h.connector.state.orders.size, 1);

  await assert.rejects(
    () =>
      h.runtime.execute({
        ...base,
        requestId: "req-stale",
        idempotencyKey: "idem-stale",
        input: {
          items: [
            {
              itemId: "coffee-1",
              quantity: 1,
              unitPrice: { amount: "7.00", currency: "USD" },
              version: "menu-v1",
            },
          ],
        },
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONFLICT" &&
      error.details.reason === "stale_price",
  );

  await assert.rejects(
    () =>
      h.runtime.execute({
        ...base,
        requestId: "req-stock",
        idempotencyKey: "idem-stock",
        input: {
          items: [
            {
              itemId: "steak-1",
              quantity: 1,
              unitPrice: { amount: "28.00", currency: "USD" },
              version: "menu-v1",
            },
          ],
        },
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONFLICT" &&
      error.details.reason === "inventory_conflict",
  );
});


test("RST-006 reservation zoned time rejects offset/timezone mismatch", async () => {
  const h = harness();
  await assert.rejects(
    () =>
      h.runtime.execute({
        requestId: "req-time",
        capability: "reservation.create",
        capabilityVersion: "0.1.0",
        actor: { type: "agent", id: "agent-1" },
        principal: { type: "user", id: "user-1" },
        delegation: {
          type: "oauth",
          scopes: ["reservation:create"],
          expiresAt: "2099-01-01T00:00:00Z",
        },
        input: {
          guests: 2,
          scheduledTime: {
            dateTime: "2026-10-03T18:00:00+00:00",
            timeZone: "Asia/Singapore",
          },
        },
        idempotencyKey: "idem-time",
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "INVALID_INPUT" &&
      error.details.reason === "invalid_zoned_business_time",
  );
  assert.equal(h.connector.state.reservations.size, 0);
});

test("RST-016 actor identity without delegation cannot mutate restaurant state", async () => {
  const h = harness();
  await assert.rejects(
    () =>
      h.runtime.execute({
        requestId: "req-unauth",
        capability: "order.create",
        capabilityVersion: "0.1.0",
        actor: { type: "agent", id: "agent-1" },
        input: {
          items: [
            {
              itemId: "coffee-1",
              quantity: 1,
              unitPrice: { amount: "6.80", currency: "USD" },
              version: "menu-v1",
            },
          ],
        },
        idempotencyKey: "idem-unauth",
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "UNAUTHORIZED",
  );
  assert.equal(h.connector.state.orders.size, 0);
});

test("RST-012/018 payment.request requires explicit approval bound to exact input", async () => {
  const h = harness();
  const order = await h.runtime.execute({
    requestId: "req-order-pay",
    capability: "order.create",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["order:create"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: {
      items: [
        {
          itemId: "coffee-1",
          quantity: 1,
          unitPrice: { amount: "6.80", currency: "USD" },
          version: "menu-v1",
        },
      ],
    },
    idempotencyKey: "idem-order-pay",
  });

  const orderId = (order.output as { orderId: string }).orderId;
  const paymentAction: ActionRequest = {
    requestId: "req-pay",
    capability: "payment.request",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["payment:request"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: {
      orderId,
      amount: { amount: "6.80", currency: "USD" },
    },
    idempotencyKey: "idem-pay",
    correlationId: "corr-pay",
    causationId: "cause-pay",
  };

  await assert.rejects(
    () => h.runtime.execute(paymentAction),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "APPROVAL_REQUIRED",
  );

  const paymentContract = h.registry.resolve("payment.request", "0.1.0");
  const approval: ApprovalRecord = {
    requestId: paymentAction.requestId,
    capability: paymentAction.capability,
    inputDigest: approvalInputDigest(paymentContract, paymentAction),
    approver: { type: "user", id: "user-1" },
    expiresAt: "2099-01-01T00:00:00Z",
  };

  const result = await h.runtime.execute(paymentAction, {
    approvals: [approval],
  });

  const output = result.output as {
    status: string;
    amount: { amount: string; currency: string };
  };
  assert.equal(output.status, "authorized");
  assert.deepEqual(output.amount, { amount: "6.80", currency: "USD" });
});

test("RST-019/020 successful mutation records audit and event correlation", async () => {
  const h = harness();
  await h.runtime.execute({
    requestId: "req-audit",
    capability: "reservation.create",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["reservation:create"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: {
      guests: 2,
      scheduledTime: {
        dateTime: "2026-10-03T18:00:00+08:00",
        timeZone: "Asia/Singapore",
      },
    },
    idempotencyKey: "idem-audit",
    correlationId: "corr-audit",
    causationId: "cause-audit",
  });

  const audit = h.audit.records.at(-1);
  const event = h.events.events.at(-1);
  assert.equal(audit?.capability, "reservation.create");
  assert.equal(audit?.correlationId, "corr-audit");
  assert.equal(audit?.principal?.id, "user-1");
  assert.equal(event?.correlationId, "corr-audit");
  assert.equal(event?.causationId, "cause-audit");
  assert.equal(event?.type, "brivya.action.succeeded");
});


test("RST-003 manifest rejects inline secrets", () => {
  const invalid = restaurantManifestYaml + "\naccess_token: secret-value\n";
  assert.throws(
    () => loadBusinessAgentManifest(invalid),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "ManifestValidationError",
  );
});

test("RST-013 approval cannot be reused for changed payment input", async () => {
  const h = harness();
  const order = await h.runtime.execute({
    requestId: "req-order-digest",
    capability: "order.create",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["order:create"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: {
      items: [
        {
          itemId: "coffee-1",
          quantity: 1,
          unitPrice: { amount: "6.80", currency: "USD" },
          version: "menu-v1",
        },
      ],
    },
    idempotencyKey: "idem-order-digest",
  });
  const orderId = (order.output as { orderId: string }).orderId;

  const original: ActionRequest = {
    requestId: "req-pay-digest",
    capability: "payment.request",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["payment:request"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: { orderId, amount: { amount: "6.80", currency: "USD" } },
    idempotencyKey: "idem-pay-digest",
  };
  const contract = h.registry.resolve("payment.request", "0.1.0");
  const approval: ApprovalRecord = {
    requestId: original.requestId,
    capability: original.capability,
    inputDigest: approvalInputDigest(contract, original),
    approver: { type: "user", id: "user-1" },
    expiresAt: "2099-01-01T00:00:00Z",
  };

  await assert.rejects(
    () =>
      h.runtime.execute(
        {
          ...original,
          input: { orderId, amount: { amount: "7.00", currency: "USD" } },
        },
        { approvals: [approval] },
      ),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONFLICT" &&
      error.details.reason === "approval_digest_mismatch",
  );
});

test("RST-014 policy deny blocks mutation before connector side effects", async () => {
  const registry = new CapabilityRegistry();
  registerRestaurantCapabilities(registry);
  const connector = new RestaurantMockConnector();
  const runtime = new BusinessRuntime({
    registry,
    connector,
    policy: new RulePolicyEngine([
      ({ capability }) =>
        capability.id === "reservation.create"
          ? deny("restaurant_closed")
          : undefined,
    ]),
  });

  await assert.rejects(
    () =>
      runtime.execute({
        requestId: "req-deny",
        capability: "reservation.create",
        capabilityVersion: "0.1.0",
        actor: { type: "agent", id: "agent-1" },
        principal: { type: "user", id: "user-1" },
        delegation: {
          type: "oauth",
          scopes: ["reservation:create"],
          expiresAt: "2099-01-01T00:00:00Z",
        },
        input: {
          guests: 2,
          scheduledTime: {
            dateTime: "2026-10-03T18:00:00+08:00",
            timeZone: "Asia/Singapore",
          },
        },
        idempotencyKey: "idem-deny",
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "POLICY_DENIED",
  );
  assert.equal(connector.state.reservations.size, 0);
});

test("RST-015 policy obligation remains part of canonical execution context", async () => {
  const registry = new CapabilityRegistry();
  registerRestaurantCapabilities(registry);
  let obligations: readonly { type: string }[] = [];
  const connector = new FunctionConnectorExecutor(async (context) => {
    obligations = context.obligations;
    return {
      reservationId: "res-obligation",
      guests: 2,
      scheduledTime: {
        dateTime: "2026-10-03T18:00:00+08:00",
        timeZone: "Asia/Singapore",
      },
      status: "confirmed",
    };
  });
  const runtime = new BusinessRuntime({
    registry,
    connector,
    policy: new RulePolicyEngine([
      ({ capability }) =>
        capability.id === "reservation.create"
          ? requireApproval("capture-review", [{ type: "mask", field: "guest_name" }])
          : undefined,
    ]),
  });
  const action: ActionRequest = {
    requestId: "req-obligation",
    capability: "reservation.create",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["reservation:create"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
    input: {
      guests: 2,
      scheduledTime: {
        dateTime: "2026-10-03T18:00:00+08:00",
        timeZone: "Asia/Singapore",
      },
    },
    idempotencyKey: "idem-obligation",
  };
  const contract = registry.resolve("reservation.create", "0.1.0");
  const approval: ApprovalRecord = {
    requestId: action.requestId,
    capability: action.capability,
    inputDigest: approvalInputDigest(contract, action),
    approver: { type: "user", id: "user-1" },
    expiresAt: "2099-01-01T00:00:00Z",
  };
  await runtime.execute(action, { approvals: [approval] });
  assert.deepEqual(obligations.map((item) => item.type), ["mask"]);
});

test("RST-017 connector timeout remains structured and auditable", async () => {
  const registry = new CapabilityRegistry();
  registerRestaurantCapabilities(registry);
  const audit = new InMemoryAuditSink();
  const runtime = new BusinessRuntime({
    registry,
    audit,
    connector: new FunctionConnectorExecutor(async () => {
      throw new BrivyaError("TIMEOUT", "Restaurant backend timed out.", {
        retryable: true,
      });
    }),
  });

  await assert.rejects(
    () =>
      runtime.execute({
        requestId: "req-timeout",
        capability: "menu.search",
        capabilityVersion: "0.1.0",
        actor: { type: "agent", id: "agent-1" },
        input: { query: "coffee" },
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "TIMEOUT" &&
      error.retryable === true,
  );
  assert.equal(audit.records.at(-1)?.errorCode, "TIMEOUT");
});

test("RST-021 REST and MCP query parity use the same restaurant runtime", async () => {
  const h = harness();
  const rest = new RestAdapter(h.runtime, {
    generateRequestId: () => "req-rest-menu",
  });
  const mcp = new BrivyaMcpAdapter(h.runtime, h.registry, {
    generateRequestId: () => "req-mcp-menu",
    resolveContext: () => ({
      actor: { type: "agent", id: "mcp-agent" },
    }),
  });
  const input = { query: "vegetarian", available_only: true };

  const restResult = await rest.handle(
    {
      method: "POST",
      path: "/v0alpha1/capabilities/menu.search/execute",
      headers: { "X-Brivya-Capability-Version": "0.1.0" },
      body: { input },
    },
    { actor: { type: "agent", id: "rest-agent" } },
  );
  const capability = h.registry.resolve("menu.search", "0.1.0");
  const mcpResult = await mcp.callTool(capabilityToolName(capability), input);

  assert.equal(restResult.status, 200);
  assert.deepEqual(
    (restResult.body as { data: unknown }).data,
    mcpResult.structuredContent,
  );
});

test("RST-022 REST and MCP mutation parity preserve authorization failure", async () => {
  const h = harness();
  const rest = new RestAdapter(h.runtime, {
    generateRequestId: () => "req-rest-res",
  });
  const mcp = new BrivyaMcpAdapter(h.runtime, h.registry, {
    generateRequestId: () => "req-mcp-res",
    resolveContext: () => ({
      actor: { type: "agent", id: "mcp-agent" },
    }),
  });
  const input = {
    guests: 2,
    scheduledTime: {
      dateTime: "2026-10-03T18:00:00+08:00",
      timeZone: "Asia/Singapore",
    },
  };

  const restResult = await rest.handle(
    {
      method: "POST",
      path: "/v0alpha1/capabilities/reservation.create/execute",
      headers: { "X-Brivya-Capability-Version": "0.1.0" },
      body: { input },
    },
    { actor: { type: "agent", id: "rest-agent" } },
  );
  const capability = h.registry.resolve("reservation.create", "0.1.0");
  const mcpResult = await mcp.callTool(capabilityToolName(capability), input);

  assert.equal(restResult.status, 403);
  assert.equal(
    (restResult.body as { error: { code: string } }).error.code,
    "UNAUTHORIZED",
  );
  assert.equal(mcpResult.isError, true);
  const text = mcpResult.content.find((item) => item.type === "text");
  assert.ok(text && text.type === "text");
  assert.equal(
    (JSON.parse(text.text) as { error: { code: string } }).error.code,
    "UNAUTHORIZED",
  );
  assert.equal(h.connector.state.reservations.size, 0);
});

test("RST-023 adapter metadata cannot downgrade canonical approval contract", () => {
  const h = harness();
  const payment = h.registry.resolve("payment.request", "0.1.0");
  const mcp = new BrivyaMcpAdapter(h.runtime, h.registry);
  const projected = mcp
    .listTools()
    .find((tool) => tool.capability.id === "payment.request");

  assert.equal(payment.approval, "required");
  assert.equal(projected?.capability, payment);
  assert.equal(projected?.capability.approval, "required");
  assert.equal(projected?.capability.risk, "high");
});

test("RST-024 invalid restaurant input fails schema validation before connector execution", async () => {
  const h = harness();
  await assert.rejects(
    () =>
      h.runtime.execute({
        requestId: "req-invalid",
        capability: "availability.check",
        capabilityVersion: "0.1.0",
        actor: { type: "agent", id: "agent-1" },
        input: {
          date: "2026-10-03",
          guests: 0,
          unexpected: true,
        },
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "INVALID_INPUT",
  );
  assert.equal(h.connector.state.reservations.size, 0);
  assert.equal(h.connector.state.orders.size, 0);
});
