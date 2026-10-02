import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityContract } from "@brivya/core";
import { validateCapabilityProjection } from "@brivya/distribution";
import type { SemanticExperience } from "@brivya/experience";

import {
  renderWeChatAiPackage,
  wechatAiProfile,
} from "../src/index.js";

const orderCreate: CapabilityContract = {
  id: "order.create",
  version: "0.1.0",
  description: "Create an order",
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

const experience: SemanticExperience = {
  apiVersion: "brivya.dev/v0alpha1",
  kind: "SemanticExperience",
  metadata: { id: "order-summary" },
  view: { type: "confirmation", resource: "order" },
  actions: [
    {
      id: "confirm-order",
      type: "capability",
      capability: "order.create",
      interaction: { confirmation: "required" },
    },
  ],
};

test("WeChat AI is a traffic-platform native renderer profile", () => {
  assert.equal(wechatAiProfile.target.category, "traffic-platform");
  assert.equal(wechatAiProfile.experience.renderer, "platform-native");
  assert.equal(wechatAiProfile.identity.selfAssertedIdentity, "forbidden");
});

test("WeChat package projects capability, native component and trusted runtime bridge", () => {
  const rendered = renderWeChatAiPackage(
    {
      id: "amina-coffee",
      name: "Amina Coffee",
      description: "Menu, booking and ordering",
      skillName: "amina-coffee",
    },
    [orderCreate],
    experience,
  );

  assert.equal(
    validateCapabilityProjection(orderCreate, rendered.projections[0]!).status,
    "pass",
  );
  assert.ok(rendered.artifacts["SKILL.md"]?.includes("UI confirmation never replaces"));
  assert.ok(rendered.artifacts["mcp.json"]?.includes('"approval": "required"'));
  assert.ok(
    rendered.artifacts["apis/runtime-bridge.json"]?.includes(
      '"clientSuppliedIdentity": "forbidden"',
    ),
  );
  assert.deepEqual(rendered.render.bindings, [
    {
      semanticAction: "confirm-order",
      capability: "order.create",
      platformAction: "api/call:order.create",
    },
  ]);
});

test("WeChat structuredContent and _meta remain separate render channels", () => {
  const rendered = renderWeChatAiPackage(
    {
      id: "amina-coffee",
      name: "Amina Coffee",
      description: "Menu, booking and ordering",
      skillName: "amina-coffee",
    },
    [orderCreate],
    experience,
  );

  const descriptor = JSON.parse(
    rendered.artifacts["components/order-summary-card/index.json"]!,
  ) as {
    dataContract: {
      structuredContent: string;
      _meta: string;
    };
  };

  assert.equal(descriptor.dataContract.structuredContent, "business-data");
  assert.equal(descriptor.dataContract._meta, "render-only-data");
});
