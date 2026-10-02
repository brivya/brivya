import type { CapabilityContract } from "@brivya/core";

import type { DistributionFinding, DistributionValidationResult } from "./validation.js";

export interface CapabilityProjection {
  id: string;
  version: string;
  mode: CapabilityContract["mode"];
  risk: CapabilityContract["risk"];
  approval: CapabilityContract["approval"];
  permissions: readonly string[];
  idempotencyRequired: boolean;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

export function projectCapability(
  capability: CapabilityContract,
): CapabilityProjection {
  return {
    id: capability.id,
    version: capability.version,
    mode: capability.mode,
    risk: capability.risk,
    approval: capability.approval,
    permissions: [...capability.permissions],
    idempotencyRequired: capability.idempotency.required,
    inputSchema: capability.inputSchema,
    outputSchema: capability.outputSchema,
  };
}

export function validateCapabilityProjection(
  canonical: CapabilityContract,
  projected: CapabilityProjection,
): DistributionValidationResult {
  const findings: DistributionFinding[] = [];

  exact(findings, "PROFILE_CAPABILITY_ID_DRIFT", "id", canonical.id, projected.id);
  exact(findings, "PROFILE_CAPABILITY_VERSION_DRIFT", "version", canonical.version, projected.version);
  exact(findings, "PROFILE_MODE_DRIFT", "mode", canonical.mode, projected.mode);
  exact(findings, "PROFILE_RISK_DOWNGRADE", "risk", canonical.risk, projected.risk);
  exact(findings, "PROFILE_APPROVAL_DOWNGRADE", "approval", canonical.approval, projected.approval);

  const canonicalPermissions = [...canonical.permissions].sort();
  const projectedPermissions = [...projected.permissions].sort();
  if (JSON.stringify(canonicalPermissions) !== JSON.stringify(projectedPermissions)) {
    findings.push({
      code: "PROFILE_PERMISSION_DRIFT",
      severity: "error",
      path: "permissions",
      message: "Projected permissions must exactly preserve canonical permissions.",
    });
  }

  if (
    canonical.idempotency.required &&
    !projected.idempotencyRequired
  ) {
    findings.push({
      code: "PROFILE_IDEMPOTENCY_DOWNGRADE",
      severity: "error",
      path: "idempotencyRequired",
      message: "Projection cannot remove required idempotency.",
    });
  }

  if (
    stableJson(canonical.inputSchema) !== stableJson(projected.inputSchema) ||
    stableJson(canonical.outputSchema) !== stableJson(projected.outputSchema)
  ) {
    findings.push({
      code: "PROFILE_SCHEMA_DRIFT",
      severity: "error",
      path: "schema",
      message: "Projected input/output schemas must preserve canonical schema truth.",
    });
  }

  return {
    status: findings.length > 0 ? "fail" : "pass",
    findings,
  };
}

function exact(
  findings: DistributionFinding[],
  code: string,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (expected !== actual) {
    findings.push({
      code,
      severity: "error",
      path,
      message: `Expected ${String(expected)} but projected ${String(actual)}.`,
    });
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
