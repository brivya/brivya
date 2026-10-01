import { BrivyaError } from "@brivya/core";

export type IdempotencyClaim<Result> =
  | { status: "acquired" }
  | { status: "replay"; result: Result }
  | { status: "in_flight" };

export interface IdempotencyStore<Result = unknown> {
  claim(
    key: string,
    requestDigest: string,
  ): IdempotencyClaim<Result> | Promise<IdempotencyClaim<Result>>;
  complete(
    key: string,
    requestDigest: string,
    result: Result,
  ): void | Promise<void>;
  fail(
    key: string,
    requestDigest: string,
  ): void | Promise<void>;
}

type PendingRecord<Result> =
  | {
      state: "pending";
      requestDigest: string;
    }
  | {
      state: "completed";
      requestDigest: string;
      result: Result;
    };

export class InMemoryIdempotencyStore<Result = unknown>
  implements IdempotencyStore<Result>
{
  readonly #records = new Map<string, PendingRecord<Result>>();

  claim(key: string, requestDigest: string): IdempotencyClaim<Result> {
    const existing = this.#records.get(key);
    if (!existing) {
      this.#records.set(key, {
        state: "pending",
        requestDigest,
      });
      return { status: "acquired" };
    }

    if (existing.requestDigest !== requestDigest) {
      throw new BrivyaError(
        "CONFLICT",
        "Idempotency key was already used for a different request.",
        {
          details: {
            idempotency_key: key,
            reason: "idempotency_digest_mismatch",
            expected_digest: existing.requestDigest,
            received_digest: requestDigest,
          },
        },
      );
    }

    if (existing.state === "pending") {
      return { status: "in_flight" };
    }

    return {
      status: "replay",
      result: existing.result,
    };
  }

  complete(key: string, requestDigest: string, result: Result): void {
    const existing = this.#records.get(key);
    if (!existing || existing.requestDigest !== requestDigest) {
      throw new BrivyaError(
        "CONFLICT",
        "Cannot complete an idempotency record that is not owned by this request.",
        {
          details: {
            idempotency_key: key,
            request_digest: requestDigest,
          },
        },
      );
    }

    this.#records.set(key, {
      state: "completed",
      requestDigest,
      result,
    });
  }

  fail(key: string, requestDigest: string): void {
    const existing = this.#records.get(key);
    if (
      existing &&
      existing.state === "pending" &&
      existing.requestDigest === requestDigest
    ) {
      this.#records.delete(key);
    }
  }
}
