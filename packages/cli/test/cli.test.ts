import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createActionRequest,
  executeAction,
  type CapabilityContract,
} from "@brivya/sdk";

import {
  createDevSession,
  runCli,
  starterManifest,
} from "../src/index.js";

async function tempProject(
  t: test.TestContext,
): Promise<string> {
  const dir = await mkdtemp(
    join(tmpdir(), "brivya-cli-"),
  );
  t.after(async () => {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  });
  return dir;
}

test("init creates a secret-free local project without cloud dependency", async (t) => {
  const cwd = await tempProject(t);

  const result = await runCli(
    ["init", "demo-shop"],
    { cwd },
  );

  assert.equal(result.exitCode, 0);

  const project = join(cwd, "demo-shop");
  const manifest = await readFile(
    join(project, "business.agent.yaml"),
    "utf8",
  );
  const profile = await readFile(
    join(project, "brivya.dev.json"),
    "utf8",
  );

  assert.match(
    manifest,
    /id: demo-shop/,
  );
  assert.doesNotMatch(
    manifest,
    /(password|clientSecret|apiKey|accessToken)/i,
  );
  assert.deepEqual(JSON.parse(profile), {
    schemaVersion: 1,
    capabilities: [],
    responses: {},
  });
  assert.match(
    result.stdout,
    /"cloudRequired": false/,
  );
});

test("init does not overwrite an existing manifest without --force", async (t) => {
  const cwd = await tempProject(t);

  assert.equal(
    (
      await runCli(
        ["init", "demo-shop"],
        { cwd },
      )
    ).exitCode,
    0,
  );

  const second = await runCli(
    ["init", "demo-shop"],
    { cwd },
  );

  assert.equal(second.exitCode, 1);
  assert.match(second.stderr, /CONFLICT/);
});

test("validate returns zero for a valid canonical manifest", async (t) => {
  const cwd = await tempProject(t);
  await writeFile(
    join(cwd, "business.agent.yaml"),
    starterManifest("validate-demo"),
    "utf8",
  );

  const result = await runCli(
    ["validate"],
    { cwd },
  );

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout) as {
    valid: boolean;
    issues: unknown[];
  };
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.issues, []);
});

test("validate fails closed and reports inline secret semantics", async (t) => {
  const cwd = await tempProject(t);
  await writeFile(
    join(cwd, "business.agent.yaml"),
    starterManifest("invalid-demo") +
      "\nclientSecret: forbidden-value\n",
    "utf8",
  );

  const result = await runCli(
    ["validate"],
    { cwd },
  );

  assert.equal(result.exitCode, 1);
  assert.match(
    result.stdout,
    /SECRET_INLINE_FORBIDDEN/,
  );
});

test("inspect reports connector binding posture without exposing credentialRef", async (t) => {
  const cwd = await tempProject(t);
  const manifest = `
apiVersion: brivya.dev/v0alpha1
kind: BusinessAgent
metadata:
  id: inspect-demo
  name: Inspect Demo
  version: 0.1.0
identity:
  canonicalUrl: http://localhost:8080
  domains:
    - localhost
discovery:
  public: false
  locales:
    - en-US
capabilities: []
security:
  defaultAuth: oauth2
  audit: required
connectors:
  - id: erp
    type: demo.erp
    credentialRef: secret://production/erp-token
runtime:
  mode: stateful
`;

  await writeFile(
    join(cwd, "business.agent.yaml"),
    manifest,
    "utf8",
  );

  const result = await runCli(
    ["inspect"],
    { cwd },
  );

  assert.equal(result.exitCode, 0);
  assert.match(
    result.stdout,
    /"credentialBound": true/,
  );
  assert.doesNotMatch(
    result.stdout,
    /secret:\/\/production\/erp-token/,
  );
});

test("dev bootstraps a local canonical Runtime without Brivya Cloud", async (t) => {
  const cwd = await tempProject(t);
  await runCli(
    ["init", "."],
    { cwd },
  );

  const result = await runCli(
    ["dev"],
    { cwd },
  );

  assert.equal(result.exitCode, 0);

  const body = JSON.parse(result.stdout) as {
    ready: boolean;
    mode: string;
    cloudRequired: boolean;
    capabilityCount: number;
  };

  assert.equal(body.ready, true);
  assert.equal(body.mode, "local");
  assert.equal(body.cloudRequired, false);
  assert.equal(body.capabilityCount, 0);
});

test("dev session uses the canonical BusinessRuntime for fixture execution", async () => {
  const capability: CapabilityContract = {
    id: "catalog.get",
    version: "0.1.0",
    description: "Read a catalog item.",
    resource: "catalog-item",
    mode: "query",
    execution: "sync",
    inputSchema: {
      type: "object",
      required: ["sku"],
      properties: {
        sku: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
      required: ["sku", "name"],
      properties: {
        sku: { type: "string" },
        name: { type: "string" },
      },
    },
    risk: "low",
    approval: "none",
    permissions: [],
    idempotency: { required: false },
    timeoutMs: 5_000,
  };

  const manifest = `
apiVersion: brivya.dev/v0alpha1
kind: BusinessAgent
metadata:
  id: dev-exec
  name: Dev Exec
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
  defaultAuth: local-dev
  audit: required
runtime:
  mode: stateful
`;

  const profile = JSON.stringify({
    schemaVersion: 1,
    capabilities: [capability],
    responses: {
      "catalog.get@0.1.0": {
        sku: "coffee",
        name: "House Blend",
      },
    },
  });

  const session = createDevSession(
    manifest,
    profile,
  );

  const request = createActionRequest({
    requestId: "cli-dev-1",
    capability: "catalog.get",
    capabilityVersion: "0.1.0",
    actor: {
      type: "agent",
      id: "local-dev-agent",
    },
    input: {
      sku: "coffee",
    },
  });

  const result = await executeAction<
    { sku: string },
    { sku: string; name: string }
  >(session.runtime, request);

  assert.deepEqual(result.output, {
    sku: "coffee",
    name: "House Blend",
  });
});

test("dev fails closed when the manifest references a capability absent from the local profile", async (t) => {
  const cwd = await tempProject(t);
  const manifest = starterManifest(
    "missing-capability",
  ).replace(
    "capabilities: []",
    `capabilities:
  - ref: catalog.get
    version: 0.1.0`,
  );

  await writeFile(
    join(cwd, "business.agent.yaml"),
    manifest,
    "utf8",
  );
  await writeFile(
    join(cwd, "brivya.dev.json"),
    JSON.stringify({
      schemaVersion: 1,
      capabilities: [],
      responses: {},
    }),
    "utf8",
  );

  const result = await runCli(
    ["dev"],
    { cwd },
  );

  assert.equal(result.exitCode, 1);
  assert.match(
    result.stderr,
    /CAPABILITY_UNAVAILABLE/,
  );
});
