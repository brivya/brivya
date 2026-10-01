import { randomUUID } from "node:crypto";

import {
  BrivyaError,
  type ActionRequest,
  type CapabilityContract,
  type TransactionStatus,
} from "@brivya/core";

export interface RuntimeTransaction<Result = unknown> {
  id: string;
  requestId: string;
  capability: string;
  capabilityVersion: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  correlationId?: string;
  result?: Result;
  error?: {
    code: string;
    message: string;
  };
}

export interface TransactionStore {
  create<Result = unknown>(
    capability: CapabilityContract,
    request: ActionRequest,
  ): RuntimeTransaction<Result> | Promise<RuntimeTransaction<Result>>;
  transition<Result = unknown>(
    id: string,
    status: TransactionStatus,
    patch?: {
      result?: Result;
      error?: { code: string; message: string };
    },
  ): RuntimeTransaction<Result> | Promise<RuntimeTransaction<Result>>;
  get(id: string): RuntimeTransaction | undefined | Promise<RuntimeTransaction | undefined>;
}

export interface InMemoryTransactionStoreOptions {
  now?: () => Date;
  idFactory?: () => string;
}

const ALLOWED_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  proposed: ["authorized", "cancelled", "failed"],
  authorized: ["executing", "cancelled", "failed"],
  executing: ["succeeded", "failed", "reconciling"],
  succeeded: [],
  failed: ["reconciling"],
  cancelled: [],
  reconciling: ["succeeded", "failed"],
};

export class InMemoryTransactionStore implements TransactionStore {
  readonly #records = new Map<string, RuntimeTransaction>();
  readonly #now: () => Date;
  readonly #idFactory: () => string;

  constructor(options: InMemoryTransactionStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  create<Result = unknown>(
    capability: CapabilityContract,
    request: ActionRequest,
  ): RuntimeTransaction<Result> {
    const now = this.#now().toISOString();
    const record: RuntimeTransaction<Result> = {
      id: this.#idFactory(),
      requestId: request.requestId,
      capability: capability.id,
      capabilityVersion: capability.version,
      status: "proposed",
      createdAt: now,
      updatedAt: now,
      correlationId: request.correlationId,
    };
    this.#records.set(record.id, record as RuntimeTransaction);
    return { ...record };
  }

  transition<Result = unknown>(
    id: string,
    status: TransactionStatus,
    patch: {
      result?: Result;
      error?: { code: string; message: string };
    } = {},
  ): RuntimeTransaction<Result> {
    const current = this.#records.get(id);
    if (!current) {
      throw new BrivyaError(
        "INTERNAL_ERROR",
        `Transaction ${id} does not exist.`,
        { details: { transaction_id: id } },
      );
    }

    if (!ALLOWED_TRANSITIONS[current.status].includes(status)) {
      throw new BrivyaError(
        "CONFLICT",
        `Invalid transaction transition ${current.status} -> ${status}.`,
        {
          details: {
            transaction_id: id,
            from: current.status,
            to: status,
          },
        },
      );
    }

    const next: RuntimeTransaction<Result> = {
      ...(current as RuntimeTransaction<Result>),
      status,
      updatedAt: this.#now().toISOString(),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    };

    this.#records.set(id, next as RuntimeTransaction);
    return { ...next };
  }

  get(id: string): RuntimeTransaction | undefined {
    const record = this.#records.get(id);
    return record ? { ...record } : undefined;
  }
}
