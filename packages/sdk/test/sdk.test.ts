import assert from "node:assert/strict";
import test from "node:test";

import {
  BrivyaError,
  FunctionConnectorExecutor,
  createActionRequest,
  createLocalRuntime,
  executeAction,
  loadManifest,
  validateManifest,
  type CapabilityContract,
} from "../src/index.js";

const manifestSource = `
apiVersion: brivya.dev/v0alpha1
kind: BusinessAgent
metadata:
  id: sdk-test
  name: SDK Test
  version: 0.1.0
identity:
  canonicalUrl: http://localhost:8080
  domains:
    - localhost
discovery:
  public: false
  locales:
    - en-US
capabilities:
  - ref: catalog.get
    version: 0.1.0
security:
  defaultAuth: oauth2
  audit: required
runtime:
  mode: stateful
`;

const capability: CapabilityContract = {
  id: "catalog.get",
  version: "0.1.0",
  description: "Read one catalog item.",
  resource: "catalog-item",
  mode: "query",
  execution: "sync",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sku"],
    properties: {
      sku: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sku"],
    properties: {
      sku: { type: "string" },
    },
  },
  risk: "low",
  approval: "none",
  permissions: ["catalog:read"],
  idempotency: { required: false },
  timeoutMs: 5_000,
};

test("SDK manifest helpers delegate to the canonical manifest package", () => {
  const validated = validateManifest(manifestSource, {
    capabilityExists: ({ ref, version }) =>
      ref === "catalog.get" && version === "0.1.0",
  });

  assert.equal(validated.valid, true);

  const manifest = loadManifest(manifestSource);
  assert.equal(manifest.metadata.id, "sdk-test");
  assert.equal(manifest.capabilities[0]?.ref, "catalog.get");
});

test("SDK local runtime is the canonical BusinessRuntime and preserves authorization", async () => {
  let calls = 0;
  const { runtime, registry } = createLocalRuntime({
    capabilities: [capability],
    connector: new FunctionConnectorExecutor(async ({ request }) => {
      calls += 1;
      return request.input;
    }),
  });

  assert.equal(
    registry.resolve("catalog.get", "0.1.0"),
    capability,
  );

  const unauthorized = createActionRequest({
    requestId: "sdk-req-1",
    capability: "catalog.get",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    input: { sku: "coffee" },
  });

  await assert.rejects(
    () => executeAction(runtime, unauthorized),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "UNAUTHORIZED",
  );

  assert.equal(calls, 0);

  const authorized = createActionRequest({
    requestId: "sdk-req-2",
    capability: "catalog.get",
    capabilityVersion: "0.1.0",
    actor: { type: "agent", id: "agent-1" },
    principal: { type: "user", id: "user-1" },
    delegation: {
      type: "oauth",
      scopes: ["catalog:read"],
    },
    input: { sku: "coffee" },
  });

  const result = await executeAction<
    { sku: string },
    { sku: string }
  >(runtime, authorized);

  assert.deepEqual(result.output, { sku: "coffee" });
  assert.equal(calls, 1);
});

test("SDK does not hide duplicate capability conflicts", () => {
  assert.throws(
    () =>
      createLocalRuntime({
        capabilities: [capability, capability],
        connector: new FunctionConnectorExecutor(async () => ({})),
      }),
    (error: unknown) =>
      error instanceof BrivyaError &&
      error.code === "CONFLICT",
  );
});
