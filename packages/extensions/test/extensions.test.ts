import assert from "node:assert/strict";
import test from "node:test";

import {
  ExtensionHostError,
  ExtensionHostSession,
  InMemoryRegistryClient,
  calculateEffectiveGrant,
  createInstallPlan,
  detectPermissionExpansion,
  loadExtensionManifest,
  phase1ExecutionModes,
  validateExecutionBoundary,
  validateExtensionManifest,
  type ExtensionManifest,
} from "../src/index.js";

const baseManifest: ExtensionManifest = {
  apiVersion: "brivya.dev/v0alpha1",
  kind: "Extension",
  metadata: {
    name: "example-connector",
    displayName: "Example Connector",
    publisher: "acme",
    version: "0.1.0",
    license: "Apache-2.0",
  },
  extension: { type: "connector" },
  compatibility: { brivya: "^0.1" },
  permissions: [
    "business:read",
    "capability:execute:order.create",
    "secret:reference",
    "secret:request",
    "network:outbound",
  ],
  entrypoints: { runtime: "./dist/runtime.js" },
  security: { sandbox: "required" },
  network: { outbound: { hosts: ["api.example.com"] } },
  stopConditions: ["missing_required_scope", "credential_expired"],
};

test("Extension manifest loads accepted package contract", () => {
  const source = [
    "apiVersion: brivya.dev/v0alpha1",
    "kind: Extension",
    "metadata:",
    "  name: example-connector",
    "  displayName: Example Connector",
    "  publisher: acme",
    "  version: 0.1.0",
    "extension:",
    "  type: connector",
    "compatibility:",
    '  brivya: "^0.1"',
    "permissions:",
    "  - business:read",
    "  - network:outbound",
    "entrypoints:",
    "  runtime: ./dist/runtime.js",
    "security:",
    "  sandbox: required",
    "network:",
    "  outbound:",
    "    hosts:",
    "      - api.example.com",
    "stopConditions:",
    "  - missing_required_scope",
  ].join("\n");

  const manifest = loadExtensionManifest(source);
  assert.equal(manifest.metadata.name, "example-connector");
  assert.equal(manifest.security.sandbox, "required");
  assert.deepEqual(manifest.network?.outbound?.hosts, ["api.example.com"]);
});

test("Extension manifest rejects inline secrets and missing network allowlist", () => {
  const result = validateExtensionManifest({
    ...baseManifest,
    permissions: ["network:outbound"],
    network: undefined,
    config: { access_token: "raw-secret" },
  });

  assert.equal(result.valid, false);
  const codes = new Set(result.issues.map((issue) => issue.code));
  assert.ok(codes.has("SECRET_INLINE_FORBIDDEN"));
  assert.ok(codes.has("NETWORK_ALLOWLIST_REQUIRED"));
});

test("Effective grant is requested intersect tenant policy intersect admin grant", () => {
  const grant = calculateEffectiveGrant(
    ["business:read", "network:outbound", "distribution:publish"],
    ["business:read", "network:outbound"],
    ["business:read", "distribution:publish"],
  );
  assert.deepEqual(grant.permissions, ["business:read"]);
});

test("Permission expansion always requires reapproval", () => {
  const expansion = detectPermissionExpansion(
    { permissions: ["business:read"], networkHosts: ["api.example.com"] },
    {
      permissions: ["business:read", "network:outbound"],
      networkHosts: ["api.example.com", "api2.example.com"],
    },
  );

  assert.equal(expansion.requiresReapproval, true);
  assert.deepEqual(expansion.addedPermissions, ["network:outbound"]);
  assert.deepEqual(expansion.addedNetworkHosts, ["api2.example.com"]);
});

test("Install plan never auto-activates and flags high-risk/expanded permissions", () => {
  const previous: ExtensionManifest = {
    ...baseManifest,
    metadata: { ...baseManifest.metadata, version: "0.1.0" },
    permissions: ["business:read"],
    network: undefined,
  };
  const next: ExtensionManifest = {
    ...baseManifest,
    metadata: { ...baseManifest.metadata, version: "0.1.1" },
    permissions: ["business:read", "distribution:publish"],
    network: undefined,
  };

  const plan = createInstallPlan(next, { previousManifest: previous });
  assert.equal(plan.activationAllowed, false);
  assert.equal(plan.requiresExplicitApproval, true);
  assert.equal(plan.requiresReapproval, true);
  assert.deepEqual(plan.permissionExpansion.addedPermissions, ["distribution:publish"]);
});

test("Host API capability execution is permission-scoped and host-mediated", async () => {
  const calls: Array<{ capabilityId: string; request: unknown }> = [];
  const host = new ExtensionHostSession({
    extensionId: "acme/example",
    grantedPermissions: ["capability:execute:order.create"],
    bindings: {
      executeCapability: async (capabilityId, request) => {
        calls.push({ capabilityId, request });
        return { orderId: "ord-1" };
      },
    },
  });

  const result = await host.capabilityExecute("order.create", { sku: "A" });
  assert.deepEqual(result, { orderId: "ord-1" });
  assert.deepEqual(calls, [{ capabilityId: "order.create", request: { sku: "A" } }]);

  await assert.rejects(
    () => host.capabilityExecute("payment.request", {}),
    (error: unknown) =>
      error instanceof ExtensionHostError && error.code === "PERMISSION_DENIED",
  );
});

test("Host API exposes opaque secret binding only and has no raw-secret path", async () => {
  const host = new ExtensionHostSession({
    extensionId: "acme/example",
    grantedPermissions: ["secret:reference", "secret:request"],
    bindings: {
      requestSecretBinding: async (reference) => ({
        bindingId: "binding-1",
        reference,
        expiresAt: "2026-10-02T06:00:00Z",
      }),
    },
  });

  const binding = await host.secretRequestBinding("secret://vendor-production");
  assert.equal("value" in binding, false);
  assert.equal("secret" in binding, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(host), "secretReadRaw"),
    false,
  );
});

test("Host outbound network is both permission- and allowlist-scoped", async () => {
  const requested: string[] = [];
  const host = new ExtensionHostSession({
    extensionId: "acme/example",
    grantedPermissions: ["network:outbound"],
    outboundHosts: ["api.example.com"],
    bindings: {
      networkRequest: async (url) => {
        requested.push(url);
        return { ok: true };
      },
    },
  });

  assert.deepEqual(await host.networkRequest("https://api.example.com/v1"), { ok: true });

  await assert.rejects(
    () => host.networkRequest("https://evil.example/v1"),
    (error: unknown) =>
      error instanceof ExtensionHostError && error.code === "PERMISSION_DENIED",
  );
  assert.deepEqual(requested, ["https://api.example.com/v1"]);
});

test("Phase 1 execution boundary represents worker and remote while denying unsafe modes", () => {
  assert.deepEqual(phase1ExecutionModes(), ["worker", "remote"]);

  const limits = {
    timeoutMs: 5000,
    memoryMb: 128,
    concurrentInvocations: 4,
    requestBytes: 1024 * 1024,
    responseBytes: 1024 * 1024,
    logBytes: 256 * 1024,
  };

  assert.equal(
    validateExecutionBoundary({
      trustTier: "verified-third-party",
      mode: "worker",
      limits,
    }).valid,
    true,
  );

  assert.equal(
    validateExecutionBoundary({
      trustTier: "verified-third-party",
      mode: "remote",
      outboundHosts: ["api.example.com"],
      limits,
    }).valid,
    true,
  );

  const unsafe = validateExecutionBoundary({
    trustTier: "unverified-third-party",
    mode: "in_process",
    limits,
  });
  assert.equal(unsafe.valid, false);
  assert.equal(unsafe.findings[0]?.code, "IN_PROCESS_TRUST_REQUIRED");
});

test("Registry client is supply-chain oriented and preserves package state", async () => {
  const registry = new InMemoryRegistryClient([
    {
      id: "acme/example-connector",
      version: "0.1.0",
      type: "connector",
      publisher: { id: "acme", verified: true },
      artifact: { digest: "sha256:abc", signature: "sig" },
      compatibility: { brivya: "^0.1" },
      permissions: ["business:read"],
      dependencies: [],
      status: "published",
    },
  ]);

  const record = await registry.getPackage("acme/example-connector", "0.1.0");
  assert.equal(record?.status, "published");
  assert.equal(record?.publisher.verified, true);
});


test("Host API rejects unsupported host versions before execution", () => {
  assert.throws(
    () =>
      new ExtensionHostSession({
        extensionId: "acme/example",
        hostApiVersion: "0.2" as "0.1",
        grantedPermissions: [],
      }),
    (error: unknown) =>
      error instanceof ExtensionHostError &&
      error.code === "VERSION_UNSUPPORTED",
  );
});

test("Host API state keys are extension-scoped", async () => {
  const reads: string[] = [];
  const writes: Array<{ key: string; value: unknown }> = [];
  const host = new ExtensionHostSession({
    extensionId: "acme/example",
    grantedPermissions: [],
    bindings: {
      getState: async (key) => {
        reads.push(key);
        return "value";
      },
      putState: async (key, value) => {
        writes.push({ key, value });
      },
    },
  });

  await host.stateGet("cursor");
  await host.statePut("cursor", "next");

  assert.deepEqual(reads, ["extension:acme/example:cursor"]);
  assert.deepEqual(writes, [
    { key: "extension:acme/example:cursor", value: "next" },
  ]);
});

test("Host and manifest reject private or insecure outbound destinations", async () => {
  const manifest = validateExtensionManifest({
    ...baseManifest,
    permissions: ["network:outbound"],
    network: {
      outbound: {
        hosts: ["127.0.0.1"],
      },
    },
  });
  assert.equal(manifest.valid, false);

  const host = new ExtensionHostSession({
    extensionId: "acme/example",
    grantedPermissions: ["network:outbound"],
    outboundHosts: ["127.0.0.1", "api.example.com"],
    bindings: {
      networkRequest: async () => ({ ok: true }),
    },
  });

  await assert.rejects(
    () => host.networkRequest("https://127.0.0.1/internal"),
    (error: unknown) =>
      error instanceof ExtensionHostError &&
      error.code === "PERMISSION_DENIED",
  );

  await assert.rejects(
    () => host.networkRequest("http://api.example.com/plaintext"),
    (error: unknown) =>
      error instanceof ExtensionHostError &&
      error.code === "PERMISSION_DENIED",
  );
});
