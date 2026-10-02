import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityContract } from "@brivya/core";
import { validateCapabilityProjection } from "@brivya/distribution";

import {
  renderWorkBuddyPackage,
  workbuddyProfile,
} from "../src/index.js";

const capability: CapabilityContract = {
  id: "order.create",
  version: "0.1.0",
  description: "Create order",
  resource: "order",
  mode: "mutation",
  execution: "sync",
  inputSchema: {
    type: "object",
    required: ["sku"],
    properties: { sku: { type: "string" } },
  },
  outputSchema: {
    type: "object",
    required: ["orderId"],
    properties: { orderId: { type: "string" } },
  },
  risk: "high",
  approval: "required",
  permissions: ["order:create"],
  idempotency: { required: true },
  timeoutMs: 5000,
};

test("WorkBuddy profile remains a structured MCP projection", () => {
  assert.deepEqual(workbuddyProfile.invocation.protocols, ["mcp"]);
  assert.equal(workbuddyProfile.experience.renderer, "structured");
});

test("WorkBuddy package preserves canonical capability safety metadata", () => {
  const rendered = renderWorkBuddyPackage(
    {
      id: "amina-coffee",
      name: "Amina Coffee",
      description: "Restaurant service",
      mcpEndpoint: "https://amina.example/mcp",
      authMode: "delegated",
    },
    [capability],
  );

  assert.equal(
    validateCapabilityProjection(capability, rendered.projections[0]!).status,
    "pass",
  );
  assert.ok(rendered.artifacts["mcp.json"]?.includes('"brivya/approval": "required"'));
  assert.ok(rendered.artifacts["skills/business/SKILL.md"]?.includes("order.create@0.1.0"));
});
