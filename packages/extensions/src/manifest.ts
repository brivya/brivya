import { parse } from "yaml";

import {
  KNOWN_PERMISSION_BASES,
  normalizePermission,
  type ExtensionPermission,
} from "./permissions.js";

export type ExtensionType =
  | "capability-pack"
  | "connector"
  | "distribution-adapter"
  | "industry-blueprint"
  | "workflow-pack"
  | "policy-pack"
  | "ui-block"
  | "theme"
  | "developer-tool";

export interface ExtensionDependency {
  coordinate: string;
  version: string;
}

export interface ExtensionManifest {
  apiVersion: "brivya.dev/v0alpha1";
  kind: "Extension";
  metadata: {
    name: string;
    displayName: string;
    publisher: string;
    version: string;
    license?: string;
  };
  extension: {
    type: ExtensionType;
  };
  compatibility: {
    brivya: string;
    protocols?: readonly string[];
    regions?: readonly string[];
  };
  permissions: readonly ExtensionPermission[];
  entrypoints?: {
    runtime?: string;
    studio?: string;
  };
  security: {
    sandbox: "required";
  };
  network?: {
    outbound?: {
      hosts: readonly string[];
    };
  };
  stopConditions?: readonly string[];
  dependencies?: readonly ExtensionDependency[];
}

export interface ExtensionManifestIssue {
  code:
    | "MANIFEST_INVALID"
    | "SECRET_INLINE_FORBIDDEN"
    | "PERMISSION_INVALID"
    | "NETWORK_ALLOWLIST_REQUIRED";
  path: string;
  message: string;
}

export interface ExtensionManifestValidationResult {
  valid: boolean;
  issues: readonly ExtensionManifestIssue[];
  manifest?: ExtensionManifest;
}

const EXTENSION_TYPES = new Set<ExtensionType>([
  "capability-pack",
  "connector",
  "distribution-adapter",
  "industry-blueprint",
  "workflow-pack",
  "policy-pack",
  "ui-block",
  "theme",
  "developer-tool",
]);

const FORBIDDEN_SECRET_KEYS = new Set([
  "apikey",
  "password",
  "privatekey",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "secretvalue",
]);

export class ExtensionManifestParseError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = "ExtensionManifestParseError";
  }
}

export class ExtensionManifestValidationError extends Error {
  readonly issues: readonly ExtensionManifestIssue[];

  constructor(issues: readonly ExtensionManifestIssue[]) {
    super(`Extension Manifest validation failed with ${issues.length} issue(s).`);
    this.name = "ExtensionManifestValidationError";
    this.issues = issues;
  }
}

export function parseExtensionManifest(source: string): unknown {
  try {
    return parse(source);
  } catch (error) {
    throw new ExtensionManifestParseError("Unable to parse Extension Manifest YAML.", {
      cause: error,
    });
  }
}

export function loadExtensionManifest(source: string): ExtensionManifest {
  const result = validateExtensionManifest(parseExtensionManifest(source));
  if (!result.valid || !result.manifest) {
    throw new ExtensionManifestValidationError(result.issues);
  }
  return result.manifest;
}

export function validateExtensionManifest(
  input: unknown,
): ExtensionManifestValidationResult {
  const issues: ExtensionManifestIssue[] = [];
  scanForInlineSecrets(input, "$", issues);

  if (!isObject(input)) {
    return invalid(issues, "$", "Manifest must be an object.");
  }

  const metadata = isObject(input.metadata) ? input.metadata : undefined;
  const extension = isObject(input.extension) ? input.extension : undefined;
  const compatibility = isObject(input.compatibility)
    ? input.compatibility
    : undefined;
  const security = isObject(input.security) ? input.security : undefined;

  if (input.apiVersion !== "brivya.dev/v0alpha1") {
    issues.push(manifestIssue("$.apiVersion", "apiVersion must be brivya.dev/v0alpha1."));
  }
  if (input.kind !== "Extension") {
    issues.push(manifestIssue("$.kind", "kind must be Extension."));
  }
  if (
    !metadata ||
    !nonEmpty(metadata.name) ||
    !nonEmpty(metadata.displayName) ||
    !nonEmpty(metadata.publisher) ||
    !nonEmpty(metadata.version)
  ) {
    issues.push(manifestIssue("$.metadata", "metadata name/displayName/publisher/version are required."));
  }
  if (!extension || !EXTENSION_TYPES.has(extension.type as ExtensionType)) {
    issues.push(manifestIssue("$.extension.type", "extension.type is invalid."));
  }
  if (!compatibility || !nonEmpty(compatibility.brivya)) {
    issues.push(manifestIssue("$.compatibility.brivya", "Brivya compatibility range is required."));
  }
  if (!security || security.sandbox !== "required") {
    issues.push(manifestIssue("$.security.sandbox", "security.sandbox must be required."));
  }

  if (!Array.isArray(input.permissions)) {
    issues.push(manifestIssue("$.permissions", "permissions must be an array."));
  } else {
    for (const [index, permission] of input.permissions.entries()) {
      if (typeof permission !== "string") {
        issues.push({
          code: "PERMISSION_INVALID",
          path: `$.permissions[${index}]`,
          message: "Permission must be a string.",
        });
        continue;
      }
      const normalized = normalizePermission(permission);
      if (!normalized || !KNOWN_PERMISSION_BASES.has(normalized.base)) {
        issues.push({
          code: "PERMISSION_INVALID",
          path: `$.permissions[${index}]`,
          message: `Unknown or invalid permission: ${permission}`,
        });
      }
    }
  }

  const permissions = Array.isArray(input.permissions)
    ? input.permissions.filter((value): value is string => typeof value === "string")
    : [];

  if (permissions.includes("network:outbound")) {
    const network = isObject(input.network) ? input.network : undefined;
    const outbound = network && isObject(network.outbound)
      ? network.outbound
      : undefined;
    const hosts = outbound?.hosts;
    if (
      !Array.isArray(hosts) ||
      hosts.length === 0 ||
      hosts.some((host) => typeof host !== "string" || !host.trim())
    ) {
      issues.push({
        code: "NETWORK_ALLOWLIST_REQUIRED",
        path: "$.network.outbound.hosts",
        message: "network:outbound requires a non-empty host allowlist.",
      });
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    issues: [],
    manifest: input as unknown as ExtensionManifest,
  };
}

function invalid(
  issues: ExtensionManifestIssue[],
  path: string,
  message: string,
): ExtensionManifestValidationResult {
  issues.push(manifestIssue(path, message));
  return { valid: false, issues };
}

function manifestIssue(path: string, message: string): ExtensionManifestIssue {
  return { code: "MANIFEST_INVALID", path, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function scanForInlineSecrets(
  value: unknown,
  path: string,
  issues: ExtensionManifestIssue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanForInlineSecrets(entry, `${path}[${index}]`, issues),
    );
    return;
  }

  if (!isObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_SECRET_KEYS.has(normalized)) {
      issues.push({
        code: "SECRET_INLINE_FORBIDDEN",
        path: `${path}.${key}`,
        message: `Inline secret field '${key}' is forbidden. Use a secret reference/binding.`,
      });
    }
    scanForInlineSecrets(child, `${path}.${key}`, issues);
  }
}
