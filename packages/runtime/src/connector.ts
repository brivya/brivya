import type {
  ActionRequest,
  CapabilityContract,
  PolicyObligation,
} from "@brivya/core";

export interface ConnectorExecutionContext<Input = unknown> {
  capability: CapabilityContract;
  request: ActionRequest<Input>;
  obligations: readonly PolicyObligation[];
  transactionId: string;
}

export interface ConnectorExecutor {
  execute<Input = unknown, Output = unknown>(
    context: ConnectorExecutionContext<Input>,
  ): Output | Promise<Output>;
}

export class FunctionConnectorExecutor implements ConnectorExecutor {
  readonly #execute: (
    context: ConnectorExecutionContext,
  ) => unknown | Promise<unknown>;

  constructor(
    execute: (
      context: ConnectorExecutionContext,
    ) => unknown | Promise<unknown>,
  ) {
    this.#execute = execute;
  }

  execute<Input = unknown, Output = unknown>(
    context: ConnectorExecutionContext<Input>,
  ): Output | Promise<Output> {
    return this.#execute(
      context as ConnectorExecutionContext,
    ) as Output | Promise<Output>;
  }
}
