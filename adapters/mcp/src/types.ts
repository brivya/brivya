import type {
  Actor,
  ApprovalRecord,
  CapabilityContract,
  Delegation,
  Principal,
} from "@brivya/core";

export interface McpInvocationContext {
  actor: Actor;
  principal?: Principal;
  delegation?: Delegation;
  approvals?: readonly ApprovalRecord[];
  requestId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string;
  preconditions?: Record<string, unknown>;
}

export interface McpContextResolverInput {
  capability: CapabilityContract;
  toolName: string;
  arguments: unknown;
  serverContext: unknown;
}

export type McpContextResolver = (
  input: McpContextResolverInput,
) =>
  | McpInvocationContext
  | Promise<McpInvocationContext>;

export interface BrivyaMcpAdapterOptions {
  serverName?: string;
  serverVersion?: string;
  resolveContext?: McpContextResolver;
  generateRequestId?: () => string;
}
