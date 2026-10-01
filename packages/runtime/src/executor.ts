import {
  BrivyaError,
  type ActionRequest,
  type ApprovalRecord,
  type CapabilityContract,
  type PolicyDecision,
} from "@brivya/core";
import {
  RulePolicyEngine,
  type PolicyEngine,
} from "@brivya/policy";

import {
  ApprovalVerifier,
  type ApprovalVerificationInput,
} from "./approval.js";
import {
  AuditFactory,
  InMemoryAuditSink,
  InMemoryEventSink,
  type AuditSink,
  type EventSink,
} from "./audit.js";
import {
  DefaultAuthorizer,
  type Authorizer,
} from "./authorization.js";
import type { ConnectorExecutor } from "./connector.js";
import {
  idempotencyRequestDigest,
} from "./digest.js";
import {
  InMemoryIdempotencyStore,
  type IdempotencyClaim,
  type IdempotencyStore,
} from "./idempotency.js";
import { CapabilityRegistry } from "./registry.js";
import {
  AjvSchemaValidator,
  type SchemaValidator,
} from "./schema-validator.js";
import {
  InMemoryTransactionStore,
  type RuntimeTransaction,
  type TransactionStore,
} from "./transaction.js";

export interface ExecuteOptions {
  approvals?: readonly ApprovalRecord[];
}

export interface ExecutionResult<Output = unknown> {
  output: Output;
  transaction: RuntimeTransaction<Output>;
  policy: PolicyDecision;
  replayed: boolean;
}

export interface BusinessRuntimeOptions {
  registry: CapabilityRegistry;
  connector: ConnectorExecutor;
  policy?: PolicyEngine;
  authorizer?: Authorizer;
  approvalVerifier?: ApprovalVerifier;
  idempotency?: IdempotencyStore<ExecutionResult>;
  transactions?: TransactionStore;
  audit?: AuditSink;
  events?: EventSink;
  schemaValidator?: SchemaValidator;
  auditFactory?: AuditFactory;
}

export class BusinessRuntime {
  readonly #registry: CapabilityRegistry;
  readonly #connector: ConnectorExecutor;
  readonly #policy: PolicyEngine;
  readonly #authorizer: Authorizer;
  readonly #approvalVerifier: ApprovalVerifier;
  readonly #idempotency: IdempotencyStore<ExecutionResult>;
  readonly #transactions: TransactionStore;
  readonly #audit: AuditSink;
  readonly #events: EventSink;
  readonly #schemaValidator: SchemaValidator;
  readonly #auditFactory: AuditFactory;

  constructor(options: BusinessRuntimeOptions) {
    this.#registry = options.registry;
    this.#connector = options.connector;
    this.#policy = options.policy ?? new RulePolicyEngine();
    this.#authorizer = options.authorizer ?? new DefaultAuthorizer();
    this.#approvalVerifier =
      options.approvalVerifier ?? new ApprovalVerifier();
    this.#idempotency =
      options.idempotency ?? new InMemoryIdempotencyStore();
    this.#transactions =
      options.transactions ?? new InMemoryTransactionStore();
    this.#audit = options.audit ?? new InMemoryAuditSink();
    this.#events = options.events ?? new InMemoryEventSink();
    this.#schemaValidator =
      options.schemaValidator ?? new AjvSchemaValidator();
    this.#auditFactory = options.auditFactory ?? new AuditFactory();
  }

  async execute<Input = unknown, Output = unknown>(
    request: ActionRequest<Input>,
    options: ExecuteOptions = {},
  ): Promise<ExecutionResult<Output>> {
    const capability = this.#registry.resolve(
      request.capability,
      request.capabilityVersion,
    );

    let transaction: RuntimeTransaction | undefined;
    let idempotency:
      | {
          key: string;
          digest: string;
          claim: IdempotencyClaim<ExecutionResult>;
        }
      | undefined;

    try {
      this.#validateInput(capability, request.input);

      await this.#authorizer.authorize(capability, request);

      const policy = await this.#policy.evaluate({
        capability,
        request,
      });

      if (policy.decision === "deny") {
        throw new BrivyaError(
          "POLICY_DENIED",
          "Policy denied the requested business action.",
          {
            details: {
              capability: capability.id,
              reasons: policy.reasons,
              obligations: policy.obligations,
            },
          },
        );
      }

      const approvalInput: ApprovalVerificationInput = {
        capability,
        request,
        policy,
        approvals: options.approvals,
      };
      this.#approvalVerifier.verify(approvalInput);

      idempotency = await this.#prepareIdempotency(
        capability,
        request,
      );

      if (idempotency?.claim.status === "replay") {
        await this.#audit.append(
          this.#auditFactory.create({
            capability,
            request,
            outcome: "replayed",
            transactionId: idempotency.claim.result.transaction.id,
            details: {
              idempotency_key: request.idempotencyKey,
            },
          }),
        );

        return {
          ...(idempotency.claim.result as ExecutionResult<Output>),
          replayed: true,
        };
      }

      if (idempotency?.claim.status === "in_flight") {
        await this.#audit.append(
          this.#auditFactory.create({
            capability,
            request,
            outcome: "in_flight",
            details: {
              idempotency_key: request.idempotencyKey,
            },
          }),
        );

        throw new BrivyaError(
          "CONFLICT",
          "An action with the same idempotency key is already in flight.",
          {
            retryable: true,
            details: {
              capability: capability.id,
              idempotency_key: request.idempotencyKey,
              reason: "idempotency_in_flight",
            },
          },
        );
      }

      transaction = await this.#transactions.create(
        capability,
        request,
      );
      transaction = await this.#transactions.transition(
        transaction.id,
        "authorized",
      );
      transaction = await this.#transactions.transition(
        transaction.id,
        "executing",
      );

      let output: Output;
      try {
        output = await this.#connector.execute<Input, Output>({
          capability,
          request,
          obligations: policy.obligations,
          transactionId: transaction.id,
        });
      } catch (error) {
        throw normalizeConnectorError(error, capability);
      }

      this.#validateOutput(capability, output);

      transaction = await this.#transactions.transition<Output>(
        transaction.id,
        "succeeded",
        { result: output },
      );

      const result: ExecutionResult<Output> = {
        output,
        transaction,
        policy,
        replayed: false,
      };

      if (idempotency?.claim.status === "acquired") {
        await this.#idempotency.complete(
          idempotency.key,
          idempotency.digest,
          result,
        );
      }

      await this.#audit.append(
        this.#auditFactory.create({
          capability,
          request,
          outcome: "succeeded",
          transactionId: transaction.id,
          details: {
            policy_reasons: policy.reasons,
            obligation_types: policy.obligations.map(
              (obligation) => obligation.type,
            ),
          },
        }),
      );

      await this.#events.emit(
        this.#auditFactory.event(
          "brivya.action.succeeded",
          capability,
          request,
          {
            transactionId: transaction.id,
          },
        ),
      );

      return result;
    } catch (error) {
      const normalized = normalizeRuntimeError(error);

      if (transaction) {
        const current = await this.#transactions.get(transaction.id);
        if (
          current &&
          (current.status === "proposed" ||
            current.status === "authorized" ||
            current.status === "executing")
        ) {
          transaction = await this.#transactions.transition(
            transaction.id,
            "failed",
            {
              error: {
                code: normalized.code,
                message: normalized.message,
              },
            },
          );
        }
      }

      if (idempotency?.claim.status === "acquired") {
        await this.#idempotency.fail(
          idempotency.key,
          idempotency.digest,
        );
      }

      await this.#audit.append(
        this.#auditFactory.create({
          capability,
          request,
          outcome:
            normalized.code === "POLICY_DENIED"
              ? "denied"
              : "failed",
          transactionId: transaction?.id,
          errorCode: normalized.code,
          details: normalized.details,
        }),
      );

      await this.#events.emit(
        this.#auditFactory.event(
          "brivya.action.failed",
          capability,
          request,
          {
            transactionId: transaction?.id,
            errorCode: normalized.code,
          },
        ),
      );

      throw normalized;
    }
  }

  async #prepareIdempotency(
    capability: CapabilityContract,
    request: ActionRequest,
  ): Promise<
    | {
        key: string;
        digest: string;
        claim: IdempotencyClaim<ExecutionResult>;
      }
    | undefined
  > {
    if (
      capability.mode === "mutation" &&
      capability.idempotency.required &&
      !request.idempotencyKey
    ) {
      throw new BrivyaError(
        "INVALID_INPUT",
        "This mutation capability requires an idempotency key.",
        {
          details: {
            capability: capability.id,
            reason: "idempotency_key_required",
          },
        },
      );
    }

    if (!request.idempotencyKey) {
      return undefined;
    }

    const authority =
      request.principal
        ? `principal:${request.principal.type}:${request.principal.id}`
        : `actor:${request.actor.type}:${request.actor.id}`;

    const key =
      `${capability.id}@${capability.version}|${authority}|${request.idempotencyKey}`;
    const digest = idempotencyRequestDigest(capability, request);
    const claim = await this.#idempotency.claim(key, digest);

    return {
      key,
      digest,
      claim,
    };
  }

  #validateInput(
    capability: CapabilityContract,
    input: unknown,
  ): void {
    const result = this.#schemaValidator.validate(
      capability.inputSchema,
      input,
    );

    if (!result.valid) {
      throw new BrivyaError(
        "INVALID_INPUT",
        "Action input does not satisfy the capability input schema.",
        {
          details: {
            capability: capability.id,
            issues: result.issues,
          },
        },
      );
    }
  }

  #validateOutput(
    capability: CapabilityContract,
    output: unknown,
  ): void {
    const result = this.#schemaValidator.validate(
      capability.outputSchema,
      output,
    );

    if (!result.valid) {
      throw new BrivyaError(
        "CONNECTOR_ERROR",
        "Connector output does not satisfy the capability output schema.",
        {
          details: {
            capability: capability.id,
            reason: "output_schema_invalid",
            issues: result.issues,
          },
        },
      );
    }
  }
}

function normalizeConnectorError(
  error: unknown,
  capability: CapabilityContract,
): BrivyaError {
  if (error instanceof BrivyaError) {
    return error;
  }

  return new BrivyaError(
    "CONNECTOR_ERROR",
    "Connector execution failed.",
    {
      cause: error,
      details: {
        capability: capability.id,
      },
    },
  );
}

function normalizeRuntimeError(error: unknown): BrivyaError {
  if (error instanceof BrivyaError) {
    return error;
  }

  return new BrivyaError(
    "INTERNAL_ERROR",
    "Unexpected runtime execution failure.",
    { cause: error },
  );
}
