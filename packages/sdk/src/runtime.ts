import { randomUUID } from "node:crypto";

import type {
  ActionRequest,
  Actor,
  ApprovalRecord,
  CapabilityContract,
  Delegation,
  Principal,
} from "@brivya/core";
import {
  BusinessRuntime,
  CapabilityRegistry,
  type BusinessRuntimeOptions,
  type ConnectorExecutor,
  type ExecuteOptions,
  type ExecutionResult,
} from "@brivya/runtime";

export interface LocalRuntimeOptions
  extends Omit<
    BusinessRuntimeOptions,
    "registry" | "connector"
  > {
  capabilities: readonly CapabilityContract[];
  connector: ConnectorExecutor;
}

export interface LocalRuntime {
  registry: CapabilityRegistry;
  runtime: BusinessRuntime;
}

export function createLocalRuntime(
  options: LocalRuntimeOptions,
): LocalRuntime {
  const registry = new CapabilityRegistry();

  for (const capability of options.capabilities) {
    registry.register(capability);
  }

  const runtime = new BusinessRuntime({
    ...options,
    registry,
    connector: options.connector,
  });

  return { registry, runtime };
}

export interface CreateActionRequestOptions<Input = unknown> {
  capability: string;
  capabilityVersion?: string;
  actor: Actor;
  principal?: Principal;
  delegation?: Delegation;
  input: Input;
  preconditions?: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string;
  requestId?: string;
  generateRequestId?: () => string;
}

export function createActionRequest<Input = unknown>(
  options: CreateActionRequestOptions<Input>,
): ActionRequest<Input> {
  return {
    requestId:
      options.requestId ??
      (options.generateRequestId ?? randomUUID)(),
    capability: options.capability,
    capabilityVersion: options.capabilityVersion,
    actor: options.actor,
    principal: options.principal,
    delegation: options.delegation,
    input: options.input,
    preconditions: options.preconditions,
    idempotencyKey: options.idempotencyKey,
    correlationId: options.correlationId,
    causationId: options.causationId,
  };
}

export async function executeAction<
  Input = unknown,
  Output = unknown,
>(
  runtime: BusinessRuntime,
  request: ActionRequest<Input>,
  approvals: readonly ApprovalRecord[] = [],
): Promise<ExecutionResult<Output>> {
  const options: ExecuteOptions = { approvals };
  return runtime.execute<Input, Output>(
    request,
    options,
  );
}
