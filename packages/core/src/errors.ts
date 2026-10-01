export const BRIVYA_ERROR_CODES = [
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "APPROVAL_EXPIRED",
  "RESOURCE_NOT_FOUND",
  "CONFLICT",
  "CAPABILITY_UNAVAILABLE",
  "CONNECTOR_ERROR",
  "TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type BrivyaErrorCode = (typeof BRIVYA_ERROR_CODES)[number];

export interface BrivyaErrorShape {
  code: BrivyaErrorCode;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export class BrivyaError extends Error implements BrivyaErrorShape {
  readonly code: BrivyaErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(
    code: BrivyaErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "BrivyaError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? {};
  }

  toJSON(): BrivyaErrorShape {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}
