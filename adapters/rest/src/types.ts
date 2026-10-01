import type {
  Actor,
  ApprovalRecord,
  Delegation,
  Principal,
} from "@brivya/core";

export interface RestRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface RestResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface RestInvocationBody {
  input: unknown;
  preconditions?: Record<string, unknown>;
}

export interface RestSecurityContext {
  actor: Actor;
  principal?: Principal;
  delegation?: Delegation;
  approvals?: readonly ApprovalRecord[];
}

export interface RestAdapterOptions {
  basePath?: string;
  generateRequestId?: () => string;
}
