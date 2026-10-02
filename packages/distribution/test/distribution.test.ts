import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityContract } from "@brivya/core";

import {
  type CapabilityProjection,
  type DistributionProfile,
  projectCapability,
  validateCapabilityProjection,
  validateDistributionProfile,
} from "../src/index.js";

const profile: DistributionProfile = {
  apiVersion: "brivya.dev/v0alpha2",
  kind: "DistributionProfile",
  metadata: {
    id: "wechat-ai",
    displayName: "WeChat AI",
    version: "0.2.0",
  },
  target: {
    category: "traffic-platform",
  },
  support: {
    generate: true,
    validate: true,
    preview: true,
    guidedPublish: true,
    apiPublish: false,
    statusSync: true,
  },
  invocation: {
    protocols: ["mcp"],
    toolProjection: "generated",
  },
  identity: {
    trustedContext: "platform",
    selfAssertedIdentity: "forbidden",
    delegationMapping: "explicit",
  },
  experience: {
    semanticContract: "brivya.semantic/v0alpha1",
    renderer: "platform-native",
  },
  packaging: {
    format: "wechat-skill-package",
  },
  validation: {
    schemaParity: "required",
    policyPreservation: "required",
    identityBoundary: "required",
    renderValidation: "required",
  },
  publication: {
    manualReview: true,
    businessVerification: true,
  },
};

const canonical: CapabilityContract = {
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

test("DistributionProfile validates accepted Phase 1 invariants", () => {
  assert.equal(validateDistributionProfile(profile).status, "pass");
});

test("canonical projection is conformant", () => {
  const projected = projectCapability(canonical);
  assert.equal(validateCapabilityProjection(canonical, projected).status, "pass");
});

test("projection cannot downgrade canonical safety semantics", () => {
  const projected: CapabilityProjection = {
    ...projectCapability(canonical),
    risk: "low",
    approval: "none",
    permissions: [],
    idempotencyRequired: false,
  };

  const result = validateCapabilityProjection(canonical, projected);
  assert.equal(result.status, "fail");

  const codes = new Set(result.findings.map((finding) => finding.code));
  assert.ok(codes.has("PROFILE_RISK_DOWNGRADE"));
  assert.ok(codes.has("PROFILE_APPROVAL_DOWNGRADE"));
  assert.ok(codes.has("PROFILE_PERMISSION_DRIFT"));
  assert.ok(codes.has("PROFILE_IDEMPOTENCY_DOWNGRADE"));
});

test("projection cannot create a second schema truth", () => {
  const projected: CapabilityProjection = {
    ...projectCapability(canonical),
    inputSchema: {
      type: "object",
      properties: {},
    },
  };

  const result = validateCapabilityProjection(canonical, projected);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0]?.code, "PROFILE_SCHEMA_DRIFT");
});
