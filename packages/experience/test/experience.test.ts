import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityContract } from "@brivya/core";

import {
  type SemanticExperience,
  validateSemanticExperience,
} from "../src/index.js";

const orderCreate: CapabilityContract = {
  id: "order.create",
  version: "0.1.0",
  description: "Create order",
  resource: "order",
  mode: "mutation",
  execution: "sync",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  risk: "high",
  approval: "required",
  permissions: ["order:create"],
  idempotency: { required: true },
  timeoutMs: 5000,
};

test("SemanticExperience capability actions resolve canonical capabilities", () => {
  const experience: SemanticExperience = {
    apiVersion: "brivya.dev/v0alpha1",
    kind: "SemanticExperience",
    metadata: { id: "restaurant-menu" },
    view: { type: "collection", resource: "menu_item" },
    fields: [
      { path: "name", role: "title" },
      { path: "price", role: "money" },
    ],
    actions: [
      {
        id: "order",
        type: "capability",
        capability: "order.create",
        interaction: { confirmation: "required" },
      },
    ],
  };

  const result = validateSemanticExperience(experience, {
    capabilities: [orderCreate],
    resourceFields: {
      menu_item: ["name", "price"],
    },
  });

  assert.equal(result.status, "pass");
});

test("SemanticExperience cannot invent unknown capability actions", () => {
  const experience: SemanticExperience = {
    apiVersion: "brivya.dev/v0alpha1",
    kind: "SemanticExperience",
    metadata: { id: "bad" },
    view: { type: "detail" },
    actions: [
      {
        id: "delete",
        type: "capability",
        capability: "order.delete-all",
      },
    ],
  };

  const result = validateSemanticExperience(experience, {
    capabilities: [orderCreate],
  });

  assert.equal(result.status, "fail");
  assert.equal(result.findings[0]?.code, "EXPERIENCE_CAPABILITY_UNKNOWN");
});

test("UI confirmation intent never lowers Runtime approval truth", () => {
  const experience: SemanticExperience = {
    apiVersion: "brivya.dev/v0alpha1",
    kind: "SemanticExperience",
    metadata: { id: "order-card" },
    view: { type: "confirmation" },
    actions: [
      {
        id: "order",
        type: "capability",
        capability: "order.create",
        interaction: { confirmation: "none" },
      },
    ],
  };

  const result = validateSemanticExperience(experience, {
    capabilities: [orderCreate],
  });

  assert.equal(result.status, "warn");
  assert.equal(
    result.findings[0]?.code,
    "EXPERIENCE_CONFIRMATION_WEAKER_THAN_CAPABILITY",
  );
});
