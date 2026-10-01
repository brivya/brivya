import * as Ajv2020Module from "ajv/dist/2020.js";

import { businessAgentManifestSchema } from "./schema.js";
import type {
  BusinessAgentManifest,
  CapabilityReference,
  ProtocolEndpoint,
} from "./types.js";

export interface ManifestValidationIssue {
  code:
    | "SCHEMA_INVALID"
    | "SECRET_INLINE_FORBIDDEN"
    | "CANONICAL_URL_INVALID"
    | "PROTOCOL_ENDPOINT_INVALID"
    | "PROTOCOL_ENDPOINT_CONFLICT"
    | "CAPABILITY_NOT_FOUND";
  path: string;
  message: string;
}

export interface ManifestValidationOptions {
  capabilityExists?: (capability: CapabilityReference) => boolean;
}

export interface ManifestValidationResult {
  valid: boolean;
  issues: ManifestValidationIssue[];
  manifest?: BusinessAgentManifest;
}

const Ajv2020 = Ajv2020Module.default;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});

const validateSchema = ajv.compile(businessAgentManifestSchema);

const FORBIDDEN_SECRET_KEYS = new Set([
  "api_key",
  "apikey",
  "password",
  "private_key",
  "access_token",
  "refresh_token",
  "database_url",
  "payment_secret",
  "client_secret",
]);

export function validateBusinessAgentManifest(
  input: unknown,
  options: ManifestValidationOptions = {},
): ManifestValidationResult {
  const issues: ManifestValidationIssue[] = [];

  scanForInlineSecrets(input, "$", issues);

  const schemaValid = validateSchema(input);
  if (!schemaValid) {
    for (const error of validateSchema.errors ?? []) {
      issues.push({
        code: "SCHEMA_INVALID",
        path: error.instancePath || "$",
        message: error.message ?? "Manifest schema validation failed.",
      });
    }
  }

  if (schemaValid) {
    const manifest = input as BusinessAgentManifest;
    validateCanonicalUrl(manifest, issues);
    validateProtocolEndpoints(manifest, issues);

    if (options.capabilityExists) {
      for (const capability of manifest.capabilities) {
        if (!options.capabilityExists(capability)) {
          issues.push({
            code: "CAPABILITY_NOT_FOUND",
            path: `$.capabilities[${manifest.capabilities.indexOf(capability)}]`,
            message: `Capability ${capability.ref}${
              capability.version ? `@${capability.version}` : ""
            } does not exist in the configured registry.`,
          });
        }
      }
    }

    if (issues.length === 0) {
      return {
        valid: true,
        issues: [],
        manifest,
      };
    }
  }

  return {
    valid: false,
    issues,
  };
}

function validateCanonicalUrl(
  manifest: BusinessAgentManifest,
  issues: ManifestValidationIssue[],
): void {
  try {
    const url = new URL(manifest.identity.canonicalUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    issues.push({
      code: "CANONICAL_URL_INVALID",
      path: "$.identity.canonicalUrl",
      message: "canonicalUrl must be an absolute http(s) URL.",
    });
  }
}

function validateProtocolEndpoints(
  manifest: BusinessAgentManifest,
  issues: ManifestValidationIssue[],
): void {
  const used = new Map<string, string>();

  for (const [protocol, config] of Object.entries(
    manifest.protocols ?? {},
  ) as [string, ProtocolEndpoint][]) {
    if (!config?.enabled) {
      continue;
    }

    const endpoint = config.endpoint ?? config.basePath;
    if (!endpoint || !endpoint.startsWith("/")) {
      issues.push({
        code: "PROTOCOL_ENDPOINT_INVALID",
        path: `$.protocols.${protocol}`,
        message: "Enabled protocol endpoints must use an absolute application path beginning with '/'.",
      });
      continue;
    }

    const previous = used.get(endpoint);
    if (previous) {
      issues.push({
        code: "PROTOCOL_ENDPOINT_CONFLICT",
        path: `$.protocols.${protocol}`,
        message: `Endpoint ${endpoint} is already used by protocol ${previous}.`,
      });
      continue;
    }

    used.set(endpoint, protocol);
  }
}

function scanForInlineSecrets(
  value: unknown,
  path: string,
  issues: ManifestValidationIssue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanForInlineSecrets(entry, `${path}[${index}]`, issues),
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_SECRET_KEYS.has(normalized)) {
      issues.push({
        code: "SECRET_INLINE_FORBIDDEN",
        path: `${path}.${key}`,
        message: `Inline secret field '${key}' is forbidden. Use a credentialRef / secret reference instead.`,
      });
    }

    scanForInlineSecrets(child, `${path}.${key}`, issues);
  }
}
