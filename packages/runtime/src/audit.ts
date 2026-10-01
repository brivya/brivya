import { randomUUID } from "node:crypto";

import type {
  ActionRequest,
  BusinessEvent,
  CapabilityContract,
} from "@brivya/core";

export type AuditOutcome =
  | "succeeded"
  | "failed"
  | "denied"
  | "replayed"
  | "in_flight";

export interface AuditRecord {
  id: string;
  occurredAt: string;
  requestId: string;
  capability: string;
  capabilityVersion: string;
  actor: ActionRequest["actor"];
  principal?: ActionRequest["principal"];
  transactionId?: string;
  correlationId?: string;
  outcome: AuditOutcome;
  errorCode?: string;
  details: Record<string, unknown>;
}

export interface AuditSink {
  append(record: AuditRecord): void | Promise<void>;
}

export interface EventSink {
  emit(event: BusinessEvent): void | Promise<void>;
}

export class InMemoryAuditSink implements AuditSink {
  readonly records: AuditRecord[] = [];

  append(record: AuditRecord): void {
    this.records.push(structuredClone(record));
  }
}

export class InMemoryEventSink implements EventSink {
  readonly events: BusinessEvent[] = [];

  emit(event: BusinessEvent): void {
    this.events.push(structuredClone(event));
  }
}

export interface AuditRecordInput {
  capability: CapabilityContract;
  request: ActionRequest;
  outcome: AuditOutcome;
  transactionId?: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}

export interface AuditFactoryOptions {
  now?: () => Date;
  idFactory?: () => string;
}

export class AuditFactory {
  readonly #now: () => Date;
  readonly #idFactory: () => string;

  constructor(options: AuditFactoryOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  create(input: AuditRecordInput): AuditRecord {
    return {
      id: this.#idFactory(),
      occurredAt: this.#now().toISOString(),
      requestId: input.request.requestId,
      capability: input.capability.id,
      capabilityVersion: input.capability.version,
      actor: input.request.actor,
      principal: input.request.principal,
      transactionId: input.transactionId,
      correlationId: input.request.correlationId,
      outcome: input.outcome,
      errorCode: input.errorCode,
      details: input.details ?? {},
    };
  }

  event(
    type: string,
    capability: CapabilityContract,
    request: ActionRequest,
    payload: Record<string, unknown>,
  ): BusinessEvent {
    return {
      id: this.#idFactory(),
      type,
      occurredAt: this.#now().toISOString(),
      payload: {
        capability: capability.id,
        capabilityVersion: capability.version,
        requestId: request.requestId,
        ...payload,
      },
      correlationId: request.correlationId,
      causationId: request.causationId,
    };
  }
}
