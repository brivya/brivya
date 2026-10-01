import assert from "node:assert/strict";
import test from "node:test";

import type {
  ActionRequest,
  CapabilityContract,
} from "@brivya/core";

import {
  RulePolicyEngine,
  allow,
  deny,
  requireApproval,
} from "../src/index.js";

const capability: CapabilityContract = {
  id: "order.create",
  version: "0.1.0",
  description: "Create an order.",
  resource: "order",
  mode: "mutation",
  execution: "sync",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  risk: "medium",
  approval: "conditional",
  permissions: ["order:create"],
  idempotency: { required: true },
  timeoutMs: 5_000,
};

const request: ActionRequest = {
  requestId: "req-1",
  capability: "order.create",
  actor: { type: "agent", id: "agent-1" },
  principal: { type: "user", id: "user-1" },
  delegation: { type: "oauth", scopes: ["order:create"] },
  input: { sku: "coffee" },
  idempotencyKey: "idem-1",
};

test("deny takes precedence over allow/approval while preserving obligations", async () => {
  const engine = new RulePolicyEngine([
    () => allow("base-allow", [{ type: "log" }]),
    () => requireApproval("high-value", [{ type: "max_amount", value: 100 }]),
    () => deny("blocked-customer", [{ type: "notify" }]),
  ]);

  const decision = await engine.evaluate({ capability, request });

  assert.equal(decision.decision, "deny");
  assert.deepEqual(decision.reasons, [
    "base-allow",
    "high-value",
    "blocked-customer",
  ]);
  assert.deepEqual(
    decision.obligations.map((item) => item.type),
    ["log", "max_amount", "notify"],
  );
});

test("approval requirements aggregate when no rule denies", async () => {
  const engine = new RulePolicyEngine([
    () => allow("base"),
    () => requireApproval("manager-approval", [{ type: "capture_reason" }]),
  ]);

  const decision = await engine.evaluate({ capability, request });

  assert.equal(decision.decision, "require_approval");
  assert.deepEqual(decision.reasons, ["base", "manager-approval"]);
  assert.deepEqual(decision.obligations, [{ type: "capture_reason" }]);
});

test("empty policy engine allows by default", async () => {
  const engine = new RulePolicyEngine();
  const decision = await engine.evaluate({ capability, request });

  assert.deepEqual(decision, {
    decision: "allow",
    reasons: [],
    obligations: [],
  });
});
