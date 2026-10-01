import assert from "node:assert/strict";
import test from "node:test";

import {
  type ActionRequest,
  type ApprovalRecord,
  type CapabilityContract,
} from "@brivya/core";
import {
  RulePolicyEngine,
  deny,
} from "@brivya/policy";
import {
  ApprovalVerifier,
  BusinessRuntime,
  CapabilityRegistry,
  DefaultAuthorizer,
  FunctionConnectorExecutor,
  InMemoryIdempotencyStore,
  InMemoryTransactionStore,
  approvalInputDigest,
  type ExecutionResult,
} from "@brivya/runtime";

import {
  BrivyaMcpAdapter,
  capabilityToolName,
  type McpContextResolver,
} from "../src/index.js";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const FUTURE = "2026-10-01T01:00:00.000Z";
const now = () => new Date(NOW);

function contract(): CapabilityContract {
  return {
    id: "order.create",
    version: "0.1.0",
    description: "Create an order.",
    resource: "order",
    mode: "mutation",
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
      required: ["orderId"],
      properties: {
        orderId: { type: "string", minLength: 1 },
      },
    },
    risk: "high",
    approval: "required",
    permissions: ["order:create"],
    idempotency: { required: true },
    timeoutMs: 5_000,
  };
}

function trustedResolver(
  options: {
    badDigest?: boolean;
    noApproval?: boolean;
    idempotencyKey?: string;
  } = {},
): McpContextResolver {
  return ({ capability, arguments: args }) => {
    const requestId = "mcp-req-1";
    const action: ActionRequest = {
      requestId,
      capability: capability.id,
      capabilityVersion: capability.version,
      actor: { type: "agent", id: "mcp-agent-1" },
      principal: { type: "user", id: "user-1" },
      delegation: {
        type: "oauth",
        scopes: ["order:create"],
        expiresAt: FUTURE,
      },
      input: args,
      idempotencyKey:
        options.idempotencyKey ?? "mcp-idem-1",
      correlationId: "mcp-corr-1",
    };

    const approval: ApprovalRecord = {
      requestId,
      capability: capability.id,
      inputDigest: options.badDigest
        ? "bad-digest"
        : approvalInputDigest(capability, action),
      approver: { type: "user", id: "manager-1" },
      expiresAt: FUTURE,
    };

    return {
      actor: action.actor,
      principal: action.principal,
      delegation: action.delegation,
      requestId,
      idempotencyKey: action.idempotencyKey,
      correlationId: action.correlationId,
      approvals: options.noApproval ? [] : [approval],
    };
  };
}

function harness(options: {
  resolveContext?: McpContextResolver;
  policy?: RulePolicyEngine;
} = {}) {
  const capability = contract();
  const registry = new CapabilityRegistry();
  registry.register(capability);

  let calls = 0;
  const runtime = new BusinessRuntime({
    registry,
    policy: options.policy ?? new RulePolicyEngine(),
    authorizer: new DefaultAuthorizer({ now }),
    approvalVerifier: new ApprovalVerifier({ now }),
    idempotency:
      new InMemoryIdempotencyStore<ExecutionResult>(),
    transactions: new InMemoryTransactionStore({
      now,
      idFactory: () => "tx-mcp-1",
    }),
    connector: new FunctionConnectorExecutor(async () => {
      calls += 1;
      return { orderId: "order-1" };
    }),
  });

  const adapter = new BrivyaMcpAdapter(
    runtime,
    registry,
    {
      resolveContext: options.resolveContext,
      generateRequestId: () => "mcp-generated-1",
    },
  );

  return {
    adapter,
    capability,
    toolName: capabilityToolName(capability),
    get calls() {
      return calls;
    },
  };
}

function errorCode(
  result: {
    content: Array<{ type: string } & Record<string, unknown>>;
  },
): string | undefined {
  const textBlock = result.content.find(
    (block) => block.type === "text",
  );
  const text =
    textBlock && typeof textBlock.text === "string"
      ? textBlock.text
      : "{}";
  const parsed = JSON.parse(text) as {
    error?: { code?: string };
  };
  return parsed.error?.code;
}

test("MCP projects each capability as a versioned tool and builds an official MCP server", () => {
  const h = harness();

  assert.equal(
    h.toolName,
    "brivya.order.create.v0.1.0",
  );
  assert.deepEqual(
    h.adapter.listTools().map((tool) => tool.name),
    ["brivya.order.create.v0.1.0"],
  );

  const server = h.adapter.createServer({
    serverName: "test-brivya",
    serverVersion: "0.1.0-alpha.1",
  });

  assert.ok(server);
});

test("MCP default context fails closed for protected capabilities", async () => {
  const h = harness();

  const result = await h.adapter.callTool(
    h.toolName,
    { sku: "coffee" },
  );

  assert.equal(result.isError, true);
  assert.equal(errorCode(result), "UNAUTHORIZED");
  assert.equal(h.calls, 0);
});

test("MCP trusted context invokes the same BusinessRuntime and returns structured content", async () => {
  const h = harness({
    resolveContext: trustedResolver(),
  });

  const result = await h.adapter.callTool(
    h.toolName,
    { sku: "coffee" },
  );

  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, {
    orderId: "order-1",
  });
  assert.equal(h.calls, 1);
});

test("MCP cannot bypass approval requirements", async () => {
  const h = harness({
    resolveContext: trustedResolver({
      noApproval: true,
    }),
  });

  const result = await h.adapter.callTool(
    h.toolName,
    { sku: "coffee" },
  );

  assert.equal(result.isError, true);
  assert.equal(
    errorCode(result),
    "APPROVAL_REQUIRED",
  );
  assert.equal(h.calls, 0);
});

test("MCP preserves approval digest mismatch conflicts", async () => {
  const h = harness({
    resolveContext: trustedResolver({
      badDigest: true,
    }),
  });

  const result = await h.adapter.callTool(
    h.toolName,
    { sku: "coffee" },
  );

  assert.equal(result.isError, true);
  assert.equal(errorCode(result), "CONFLICT");
  assert.equal(h.calls, 0);
});

test("MCP preserves policy denial without connector execution", async () => {
  const h = harness({
    resolveContext: trustedResolver(),
    policy: new RulePolicyEngine([
      () => deny("blocked-account"),
    ]),
  });

  const result = await h.adapter.callTool(
    h.toolName,
    { sku: "coffee" },
  );

  assert.equal(result.isError, true);
  assert.equal(errorCode(result), "POLICY_DENIED");
  assert.equal(h.calls, 0);
});

test("MCP preserves idempotency replay and changed-input conflict semantics", async () => {
  const h = harness({
    resolveContext: trustedResolver(),
  });

  const first = await h.adapter.callTool(
    h.toolName,
    { sku: "coffee" },
  );
  const replay = await h.adapter.callTool(
    h.toolName,
    { sku: "coffee" },
  );
  const conflict = await h.adapter.callTool(
    h.toolName,
    { sku: "tea" },
  );

  assert.equal(first.isError, undefined);
  assert.equal(replay.isError, undefined);
  assert.deepEqual(replay.structuredContent, {
    orderId: "order-1",
  });
  assert.equal(conflict.isError, true);
  assert.equal(errorCode(conflict), "CONFLICT");
  assert.equal(h.calls, 1);
});
