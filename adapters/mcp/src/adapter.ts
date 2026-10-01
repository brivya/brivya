import { createHash, randomUUID } from "node:crypto";

import {
  BrivyaError,
  type ActionRequest,
  type CapabilityContract,
} from "@brivya/core";
import {
  McpServer,
  fromJsonSchema,
} from "@modelcontextprotocol/server";
import type {
  BusinessRuntime,
  CapabilityRegistry,
  ExecutionResult,
} from "@brivya/runtime";

import type {
  BrivyaMcpAdapterOptions,
  McpContextResolver,
  McpInvocationContext,
} from "./types.js";

export interface McpToolProjection {
  name: string;
  capability: CapabilityContract;
}

export interface McpToolCallResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export class BrivyaMcpAdapter {
  readonly #runtime: BusinessRuntime;
  readonly #registry: CapabilityRegistry;
  readonly #resolveContext: McpContextResolver;
  readonly #generateRequestId: () => string;
  readonly #tools = new Map<string, CapabilityContract>();

  constructor(
    runtime: BusinessRuntime,
    registry: CapabilityRegistry,
    options: BrivyaMcpAdapterOptions = {},
  ) {
    this.#runtime = runtime;
    this.#registry = registry;
    this.#resolveContext =
      options.resolveContext ?? defaultContextResolver;
    this.#generateRequestId =
      options.generateRequestId ?? randomUUID;

    for (const capability of this.#registry.list()) {
      const name = capabilityToolName(capability);
      if (this.#tools.has(name)) {
        throw new Error(
          `MCP tool name collision for ${name}.`,
        );
      }
      this.#tools.set(name, capability);
    }
  }

  listTools(): McpToolProjection[] {
    return [...this.#tools.entries()].map(
      ([name, capability]) => ({
        name,
        capability,
      }),
    );
  }

  async callTool(
    toolName: string,
    args: unknown,
    serverContext: unknown = undefined,
  ): Promise<McpToolCallResult> {
    const capability = this.#tools.get(toolName);
    if (!capability) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: {
                code: "CAPABILITY_UNAVAILABLE",
                message: `Unknown Brivya MCP tool: ${toolName}`,
                retryable: false,
                details: { tool: toolName },
              },
            }),
          },
        ],
        isError: true,
      };
    }

    let context: McpInvocationContext;
    try {
      context = await this.#resolveContext({
        capability,
        toolName,
        arguments: args,
        serverContext,
      });
    } catch (error) {
      return mcpErrorResult(
        error instanceof BrivyaError
          ? error
          : new BrivyaError(
              "UNAUTHORIZED",
              "Unable to resolve trusted MCP invocation context.",
              { cause: error },
            ),
      );
    }

    const requestId =
      context.requestId ?? this.#generateRequestId();

    const action: ActionRequest = {
      requestId,
      capability: capability.id,
      capabilityVersion: capability.version,
      actor: context.actor,
      principal: context.principal,
      delegation: context.delegation,
      input: args,
      preconditions: context.preconditions,
      idempotencyKey: context.idempotencyKey,
      correlationId: context.correlationId ?? requestId,
      causationId: context.causationId,
    };

    try {
      const result = await this.#runtime.execute(action, {
        approvals: context.approvals,
      });

      return mcpSuccessResult(result);
    } catch (error) {
      return mcpErrorResult(normalizeError(error));
    }
  }

  createServer(
    options: Pick<
      BrivyaMcpAdapterOptions,
      "serverName" | "serverVersion"
    > = {},
  ): McpServer {
    const server = new McpServer({
      name: options.serverName ?? "brivya-business-agent",
      version: options.serverVersion ?? "0.1.0-alpha.1",
    });

    for (const { name, capability } of this.listTools()) {
      server.registerTool(
        name,
        {
          description: capability.description,
          inputSchema: fromJsonSchema(
            capability.inputSchema,
          ),
          outputSchema: fromJsonSchema(
            capability.outputSchema,
          ),
          annotations: {
            readOnlyHint: capability.mode === "query",
            destructiveHint:
              capability.mode === "mutation" &&
              (capability.risk === "high" ||
                capability.risk === "critical"),
            idempotentHint:
              capability.mode === "query" ||
              capability.idempotency.required,
            openWorldHint: capability.mode === "mutation",
          },
          _meta: {
            "brivya/capability": capability.id,
            "brivya/version": capability.version,
            "brivya/risk": capability.risk,
            "brivya/approval": capability.approval,
          },
        },
        async (args, context) =>
          this.callTool(name, args, context),
      );
    }

    return server;
  }
}

export function capabilityToolName(
  capability: Pick<
    CapabilityContract,
    "id" | "version"
  >,
): string {
  const raw = `brivya.${capability.id}.v${capability.version}`;
  const sanitized = raw.replace(
    /[^A-Za-z0-9_.-]/g,
    "_",
  );

  if (sanitized.length <= 128) {
    return sanitized;
  }

  const digest = createHash("sha256")
    .update(raw)
    .digest("hex")
    .slice(0, 12);

  return `${sanitized.slice(0, 114)}.${digest}`;
}

function mcpSuccessResult(
  result: ExecutionResult,
): McpToolCallResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result.output),
      },
    ],
    structuredContent: result.output,
  };
}

function mcpErrorResult(
  error: BrivyaError,
): McpToolCallResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: error.toJSON(),
        }),
      },
    ],
    isError: true,
  };
}

function normalizeError(error: unknown): BrivyaError {
  if (error instanceof BrivyaError) {
    return error;
  }
  return new BrivyaError(
    "INTERNAL_ERROR",
    "Unexpected MCP adapter failure.",
    { cause: error },
  );
}

function defaultContextResolver(): McpInvocationContext {
  return {
    actor: {
      type: "agent",
      id: "mcp:untrusted-client",
    },
  };
}
