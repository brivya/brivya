import assert from "node:assert/strict";
import test from "node:test";

import type {
  CapabilityContract,
} from "@brivya/core";
import {
  BusinessRuntime,
  CapabilityRegistry,
  DefaultAuthorizer,
  FunctionConnectorExecutor,
  InMemoryTransactionStore,
} from "@brivya/runtime";
import {
  RestAdapter,
} from "@brivya/adapter-rest";

import {
  BrivyaMcpAdapter,
  capabilityToolName,
} from "../src/index.js";

const capability: CapabilityContract = {
  id: "catalog.get",
  version: "0.1.0",
  description: "Get one catalog item.",
  resource: "catalog-item",
  mode: "query",
  execution: "sync",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sku"],
    properties: {
      sku: { type: "string", minLength: 1 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sku", "name"],
    properties: {
      sku: { type: "string" },
      name: { type: "string" },
    },
  },
  risk: "low",
  approval: "none",
  permissions: ["catalog:read"],
  idempotency: { required: false },
  timeoutMs: 5_000,
};

function createHarness() {
  const registry = new CapabilityRegistry();
  registry.register(capability);

  let calls = 0;
  let tx = 0;

  const runtime = new BusinessRuntime({
    registry,
    authorizer: new DefaultAuthorizer({
      now: () => new Date("2026-10-01T00:00:00Z"),
    }),
    transactions: new InMemoryTransactionStore({
      idFactory: () => `tx-${++tx}`,
    }),
    connector: new FunctionConnectorExecutor(
      async ({ request }) => {
        calls += 1;
        const input = request.input as { sku: string };
        return {
          sku: input.sku,
          name: "House Blend",
        };
      },
    ),
  });

  const rest = new RestAdapter(runtime, {
    generateRequestId: () => "rest-request-1",
  });

  const mcp = new BrivyaMcpAdapter(
    runtime,
    registry,
    {
      generateRequestId: () => "mcp-request-1",
      resolveContext: () => ({
        actor: {
          type: "agent",
          id: "mcp-agent",
        },
        principal: {
          type: "user",
          id: "user-1",
        },
        delegation: {
          type: "oauth",
          scopes: ["catalog:read"],
          expiresAt: "2026-10-01T01:00:00Z",
        },
        correlationId: "mcp-corr-1",
      }),
    },
  );

  return {
    rest,
    mcp,
    get calls() {
      return calls;
    },
  };
}

function mcpErrorCode(
  result: Awaited<
    ReturnType<BrivyaMcpAdapter["callTool"]>
  >,
): string | undefined {
  const block = result.content.find(
    (item) => item.type === "text",
  );
  if (!block || block.type !== "text") {
    return undefined;
  }

  const body = JSON.parse(block.text) as {
    error?: { code?: string };
  };
  return body.error?.code;
}

test("REST and MCP project the same capability through one BusinessRuntime", async () => {
  const h = createHarness();
  const input = { sku: "coffee-1" };

  const rest = await h.rest.handle(
    {
      method: "POST",
      path: "/v0alpha1/capabilities/catalog.get/execute",
      headers: {
        "X-Brivya-Capability-Version": "0.1.0",
        "X-Correlation-Id": "rest-corr-1",
      },
      body: { input },
    },
    {
      actor: {
        type: "agent",
        id: "rest-agent",
      },
      principal: {
        type: "user",
        id: "user-1",
      },
      delegation: {
        type: "oauth",
        scopes: ["catalog:read"],
        expiresAt: "2026-10-01T01:00:00Z",
      },
    },
  );

  const mcp = await h.mcp.callTool(
    capabilityToolName(capability),
    input,
  );

  assert.equal(rest.status, 200);
  assert.deepEqual(
    (rest.body as { data: unknown }).data,
    {
      sku: "coffee-1",
      name: "House Blend",
    },
  );
  assert.deepEqual(mcp.structuredContent, {
    sku: "coffee-1",
    name: "House Blend",
  });
  assert.equal(h.calls, 2);
});

test("REST and MCP both fail closed when trusted authorization context is missing", async () => {
  const registry = new CapabilityRegistry();
  registry.register(capability);

  let calls = 0;
  const runtime = new BusinessRuntime({
    registry,
    connector: new FunctionConnectorExecutor(async () => {
      calls += 1;
      return {
        sku: "coffee-1",
        name: "House Blend",
      };
    }),
  });

  const rest = new RestAdapter(runtime, {
    generateRequestId: () => "rest-unauthorized-1",
  });
  const mcp = new BrivyaMcpAdapter(
    runtime,
    registry,
    {
      generateRequestId: () => "mcp-unauthorized-1",
    },
  );

  const restResult = await rest.handle(
    {
      method: "POST",
      path: "/v0alpha1/capabilities/catalog.get/execute",
      body: {
        input: { sku: "coffee-1" },
      },
    },
    {
      actor: {
        type: "agent",
        id: "rest-untrusted",
      },
    },
  );

  const mcpResult = await mcp.callTool(
    capabilityToolName(capability),
    { sku: "coffee-1" },
  );

  assert.equal(restResult.status, 403);
  assert.equal(
    (restResult.body as {
      error: { code: string };
    }).error.code,
    "UNAUTHORIZED",
  );
  assert.equal(mcpResult.isError, true);
  assert.equal(
    mcpErrorCode(mcpResult),
    "UNAUTHORIZED",
  );
  assert.equal(calls, 0);
});
