import assert from "node:assert/strict";
import test from "node:test";

import {
  BrivyaError,
  type ActionRequest,
  type ApprovalRecord,
} from "@brivya/core";
import { loadBusinessAgentManifest } from "@brivya/manifest";
import { RulePolicyEngine } from "@brivya/policy";
import {
  BusinessRuntime,
  CapabilityRegistry,
  InMemoryAuditSink,
  InMemoryEventSink,
  approvalInputDigest,
} from "@brivya/runtime";
import { RestaurantMockConnector } from "@brivya/connector-mock";

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
