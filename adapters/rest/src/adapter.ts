import { randomUUID } from "node:crypto";

import {
  BrivyaError,
  type ActionRequest,
} from "@brivya/core";
import type {
  BusinessRuntime,
  ExecutionResult,
} from "@brivya/runtime";

import type {
  RestAdapterOptions,
  RestInvocationBody,
  RestRequest,
  RestResponse,
  RestSecurityContext,
} from "./types.js";

const JSON_HEADERS = {
  "content-type": "application/json",
};

export class RestAdapter {
  readonly #runtime: BusinessRuntime;
  readonly #basePath: string;
  readonly #generateRequestId: () => string;

  constructor(
    runtime: BusinessRuntime,
    options: RestAdapterOptions = {},
  ) {
    this.#runtime = runtime;
    this.#basePath = normalizeBasePath(
      options.basePath ?? "/v0alpha1",
    );
    this.#generateRequestId =
      options.generateRequestId ?? randomUUID;
  }

  async handle(
    request: RestRequest,
    security: RestSecurityContext,
  ): Promise<RestResponse> {
    if (request.method.toUpperCase() !== "POST") {
      return {
        status: 405,
        headers: {
          ...JSON_HEADERS,
          allow: "POST",
        },
        body: {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Only POST is supported for capability execution.",
          },
        },
      };
    }

    const capability = parseCapabilityPath(
      this.#basePath,
      request.path,
    );
    if (!capability) {
      return {
        status: 404,
        headers: JSON_HEADERS,
        body: {
          error: {
            code: "ROUTE_NOT_FOUND",
            message: "REST capability execution route not found.",
          },
        },
      };
    }

    const body = parseInvocationBody(request.body);
    if (!body) {
      return {
        status: 400,
        headers: JSON_HEADERS,
        body: {
          error: {
            code: "INVALID_INPUT",
            message:
              "Request body must be an object containing the 'input' field.",
          },
        },
      };
    }

    const headers = normalizeHeaders(request.headers ?? {});
    const requestId =
      headers["x-request-id"] ?? this.#generateRequestId();
    const correlationId =
      headers["x-correlation-id"] ?? requestId;

    const action: ActionRequest = {
      requestId,
      capability,
      capabilityVersion:
        headers["x-brivya-capability-version"],
      actor: security.actor,
      principal: security.principal,
      delegation: security.delegation,
      input: body.input,
      preconditions: body.preconditions,
      idempotencyKey: headers["idempotency-key"],
      correlationId,
      causationId: headers["x-causation-id"],
    };

    try {
      const result = await this.#runtime.execute(action, {
        approvals: security.approvals,
      });

      return successResponse(
        result,
        requestId,
        correlationId,
      );
    } catch (error) {
      return errorResponse(
        normalizeError(error),
        requestId,
        correlationId,
      );
    }
  }
}

function successResponse(
  result: ExecutionResult,
  requestId: string,
  correlationId: string,
): RestResponse {
  return {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      "x-request-id": requestId,
      "x-correlation-id": correlationId,
      "x-brivya-transaction-id": result.transaction.id,
      "x-brivya-idempotent-replay": String(result.replayed),
    },
    body: {
      data: result.output,
      meta: {
        transactionId: result.transaction.id,
        replayed: result.replayed,
        correlationId,
      },
    },
  };
}

function errorResponse(
  error: BrivyaError,
  requestId: string,
  correlationId: string,
): RestResponse {
  return {
    status: httpStatusFor(error.code),
    headers: {
      ...JSON_HEADERS,
      "x-request-id": requestId,
      "x-correlation-id": correlationId,
    },
    body: {
      error: error.toJSON(),
      meta: {
        correlationId,
      },
    },
  };
}

function normalizeError(error: unknown): BrivyaError {
  if (error instanceof BrivyaError) {
    return error;
  }
  return new BrivyaError(
    "INTERNAL_ERROR",
    "Unexpected REST adapter failure.",
    { cause: error },
  );
}

function httpStatusFor(code: BrivyaError["code"]): number {
  switch (code) {
    case "INVALID_INPUT":
      return 400;
    case "UNAUTHORIZED":
      return 403;
    case "POLICY_DENIED":
      return 403;
    case "RESOURCE_NOT_FOUND":
      return 404;
    case "APPROVAL_REQUIRED":
      return 428;
    case "APPROVAL_EXPIRED":
    case "CONFLICT":
      return 409;
    case "CAPABILITY_UNAVAILABLE":
      return 404;
    case "CONNECTOR_ERROR":
      return 502;
    case "TIMEOUT":
      return 504;
    case "INTERNAL_ERROR":
      return 500;
  }
}

function parseInvocationBody(
  body: unknown,
): RestInvocationBody | undefined {
  if (!isRecord(body) || !("input" in body)) {
    return undefined;
  }

  const preconditions = body.preconditions;
  if (
    preconditions !== undefined &&
    !isRecord(preconditions)
  ) {
    return undefined;
  }

  return {
    input: body.input,
    ...(preconditions !== undefined
      ? { preconditions }
      : {}),
  };
}

function parseCapabilityPath(
  basePath: string,
  path: string,
): string | undefined {
  const prefix = `${basePath}/capabilities/`;
  const suffix = "/execute";

  if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
    return undefined;
  }

  const encoded = path.slice(
    prefix.length,
    path.length - suffix.length,
  );

  if (!encoded || encoded.includes("/")) {
    return undefined;
  }

  try {
    const decoded = decodeURIComponent(encoded);
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function normalizeBasePath(value: string): string {
  const withLeadingSlash = value.startsWith("/")
    ? value
    : `/${value}`;
  if (
    withLeadingSlash.length > 1 &&
    withLeadingSlash.endsWith("/")
  ) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

function normalizeHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
