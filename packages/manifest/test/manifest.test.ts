import assert from "node:assert/strict";
import test from "node:test";

import {
  ManifestValidationError,
  loadBusinessAgentManifest,
  validateBusinessAgentManifest,
} from "../src/index.js";

const VALID_MANIFEST = `
apiVersion: brivya.dev/v0alpha1
kind: BusinessAgent

metadata:
  id: amina-coffee
  name: Amina Coffee
  version: 0.1.0
  labels:
    industry: restaurant

identity:
  canonicalUrl: https://amina-coffee.agent.brivya.com
  domains:
    - amina-coffee.agent.brivya.com

discovery:
  public: true
  locales:
    - en-US
    - zh-CN

capabilities:
  - ref: menu.search
    version: 0.1.0
  - ref: reservation.create
    version: 0.1.0

protocols:
  mcp:
    enabled: true
    endpoint: /mcp
  rest:
    enabled: true
    basePath: /api

security:
  defaultAuth: oauth2
  audit: required
  scopes:
    reservation.create:
      - reservation:create

connectors:
  - id: restaurant-system
    type: mock.restaurant
    credentialRef: secret://restaurant-system

runtime:
  mode: stateful
  region: auto
`;

test("loads a valid v0alpha1 Business Agent Manifest", () => {
  const manifest = loadBusinessAgentManifest(VALID_MANIFEST, {
    capabilityExists: ({ ref }) =>
      ref === "menu.search" || ref === "reservation.create",
  });

  assert.equal(manifest.kind, "BusinessAgent");
  assert.equal(manifest.metadata.id, "amina-coffee");
  assert.equal(manifest.capabilities.length, 2);
  assert.equal(manifest.connectors?.[0]?.credentialRef, "secret://restaurant-system");
});

test("rejects unsupported manifest versions", () => {
  const invalid = VALID_MANIFEST.replace(
    "brivya.dev/v0alpha1",
    "brivya.dev/v9",
  );

  assert.throws(
    () => loadBusinessAgentManifest(invalid),
    (error: unknown) =>
      error instanceof ManifestValidationError &&
      error.issues.some((issue) => issue.code === "SCHEMA_INVALID"),
  );
});

test("rejects inline secrets even when schema also rejects the field", () => {
  const parsed = {
    apiVersion: "brivya.dev/v0alpha1",
    kind: "BusinessAgent",
    metadata: {
      id: "amina-coffee",
      name: "Amina Coffee",
      version: "0.1.0",
    },
    identity: {
      canonicalUrl: "https://amina-coffee.agent.brivya.com",
      domains: ["amina-coffee.agent.brivya.com"],
    },
    discovery: {
      public: true,
      locales: ["en-US"],
    },
    capabilities: [],
    security: {
      defaultAuth: "oauth2",
      audit: "required",
    },
    access_token: "must-not-be-here",
  };

  const result = validateBusinessAgentManifest(parsed);
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "SECRET_INLINE_FORBIDDEN",
    ),
  );
});

test("requires credentialRef to use a secret reference", () => {
  const invalid = VALID_MANIFEST.replace(
    "secret://restaurant-system",
    "plain-text-password",
  );

  assert.throws(
    () => loadBusinessAgentManifest(invalid),
    (error: unknown) =>
      error instanceof ManifestValidationError &&
      error.issues.some((issue) => issue.code === "SCHEMA_INVALID"),
  );
});

test("v0alpha1 capability references only accept exact semantic versions", () => {
  const invalid = VALID_MANIFEST.replace(
    "version: 0.1.0\n  - ref: reservation.create",
    'version: "^0.1"\n  - ref: reservation.create',
  );

  assert.throws(
    () => loadBusinessAgentManifest(invalid),
    (error: unknown) =>
      error instanceof ManifestValidationError &&
      error.issues.some((issue) => issue.code === "SCHEMA_INVALID"),
  );
});

test("rejects conflicting enabled protocol endpoints", () => {
  const invalid = VALID_MANIFEST.replace("basePath: /api", "basePath: /mcp");

  assert.throws(
    () => loadBusinessAgentManifest(invalid),
    (error: unknown) =>
      error instanceof ManifestValidationError &&
      error.issues.some(
        (issue) => issue.code === "PROTOCOL_ENDPOINT_CONFLICT",
      ),
  );
});

test("can enforce capability existence through a registry hook", () => {
  assert.throws(
    () =>
      loadBusinessAgentManifest(VALID_MANIFEST, {
        capabilityExists: ({ ref }) => ref === "menu.search",
      }),
    (error: unknown) =>
      error instanceof ManifestValidationError &&
      error.issues.some((issue) => issue.code === "CAPABILITY_NOT_FOUND"),
  );
});
