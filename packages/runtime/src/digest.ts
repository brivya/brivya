import { createHash } from "node:crypto";

import {
  BrivyaError,
  type ActionRequest,
  type CapabilityContract,
} from "@brivya/core";

export function canonicalJson(value: unknown): string {
  return encode(value, "$");
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function approvalInputDigest(
  capability: CapabilityContract,
  request: ActionRequest,
): string {
  return sha256CanonicalJson({
    capability: capability.id,
    version: capability.version,
    input: request.input,
  });
}

export function idempotencyRequestDigest(
  capability: CapabilityContract,
  request: ActionRequest,
): string {
  return sha256CanonicalJson({
    capability: capability.id,
    version: capability.version,
    principal: request.principal ?? null,
    input: request.input,
    preconditions: request.preconditions ?? null,
  });
}

function encode(value: unknown, path: string): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new BrivyaError(
          "INVALID_INPUT",
          `Non-finite number at ${path} cannot be canonically encoded.`,
          { details: { path } },
        );
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value
          .map((entry, index) => encode(entry, `${path}[${index}]`))
          .join(",")}]`;
      }

      const object = value as Record<string, unknown>;
      const keys = Object.keys(object).sort();
      const encoded: string[] = [];

      for (const key of keys) {
        const child = object[key];
        if (child === undefined) {
          throw new BrivyaError(
            "INVALID_INPUT",
            `Undefined value at ${path}.${key} cannot be canonically encoded.`,
            { details: { path: `${path}.${key}` } },
          );
        }
        encoded.push(
          `${JSON.stringify(key)}:${encode(child, `${path}.${key}`)}`,
        );
      }

      return `{${encoded.join(",")}}`;
    }
    default:
      throw new BrivyaError(
        "INVALID_INPUT",
        `Unsupported value at ${path} cannot be canonically encoded.`,
        { details: { path, value_type: typeof value } },
      );
  }
}
