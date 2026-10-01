import type { Money } from "./common-types.js";

export type JsonSchema = Record<string, unknown>;

export type CapabilityMode = "query" | "mutation";
export type ExecutionMode = "sync" | "async";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalMode =
  | "none"
  | "conditional"
  | "required"
  | "dual_control";

export interface Business {
  id: string;
  name: string;
  type: string;
}

export interface Resource {
  id: string;
  type: string;
  version?: string;
}

export interface Actor {
  type: "agent" | "service";
  id: string;
}

export interface Principal {
  type: "user" | "business" | "service";
  id: string;
}

export interface Delegation {
  type: string;
  scopes: readonly string[];
  reference?: string;
  expiresAt?: string;
}

export interface ActionContext {
  locale?: string;
  [key: string]: unknown;
}

export interface ActionRequest<Input = unknown> {
  requestId: string;
  capability: string;
  actor: Actor;
  principal?: Principal;
  delegation?: Delegation;
  input: Input;
  context?: ActionContext;
  preconditions?: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string;
}

export interface IdempotencyContract {
  required: boolean;
}

export interface CapabilityContract {
  id: string;
  version: string;
  description: string;
  resource: string;
  mode: CapabilityMode;
  execution: ExecutionMode;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  risk: RiskLevel;
  approval: ApprovalMode;
  permissions: readonly string[];
  idempotency: IdempotencyContract;
  timeoutMs: number;
  events?: readonly string[];
}

export interface PolicyObligation {
  type: string;
  [key: string]: unknown;
}

export interface PolicyDecision {
  decision: "allow" | "deny" | "require_approval";
  reasons: readonly string[];
  obligations: readonly PolicyObligation[];
}

export interface ApprovalRecord {
  requestId: string;
  capability: string;
  inputDigest: string;
  approver: {
    type: "user" | "service";
    id: string;
  };
  expiresAt: string;
}

export type TransactionStatus =
  | "proposed"
  | "authorized"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "reconciling";

export interface Transaction<Result = unknown> {
  id: string;
  capability: string;
  status: TransactionStatus;
  result?: Result;
  correlationId?: string;
}

export interface BusinessEvent<Payload = unknown> {
  id: string;
  type: string;
  occurredAt: string;
  payload: Payload;
  correlationId?: string;
  causationId?: string;
}

export interface MaxAmountObligation extends PolicyObligation {
  type: "max_amount";
  value: Money;
}
