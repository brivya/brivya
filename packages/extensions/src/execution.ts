export type ExtensionTrustTier = "first-party" | "verified-third-party" | "unverified-third-party";
export type ExtensionExecutionMode = "in_process" | "worker" | "remote" | "wasm";

export interface ExtensionResourceLimits {
  timeoutMs: number;
  memoryMb: number;
  concurrentInvocations: number;
  requestBytes: number;
  responseBytes: number;
  logBytes: number;
}

export interface ExtensionExecutionBoundary {
  trustTier: ExtensionTrustTier;
  mode: ExtensionExecutionMode;
  outboundHosts?: readonly string[];
  limits: ExtensionResourceLimits;
}

export interface ExecutionBoundaryFinding {
  code:
    | "IN_PROCESS_TRUST_REQUIRED"
    | "WASM_DEFERRED"
    | "LIMIT_INVALID"
    | "PRIVATE_NETWORK_FORBIDDEN";
  message: string;
}

export interface ExecutionBoundaryValidation {
  valid: boolean;
  findings: readonly ExecutionBoundaryFinding[];
}

export function validateExecutionBoundary(
  boundary: ExtensionExecutionBoundary,
): ExecutionBoundaryValidation {
  const findings: ExecutionBoundaryFinding[] = [];

  if (
    boundary.mode === "in_process" &&
    boundary.trustTier !== "first-party"
  ) {
    findings.push({
      code: "IN_PROCESS_TRUST_REQUIRED",
      message: "in_process execution is restricted to first-party extensions.",
    });
  }

  if (boundary.mode === "wasm") {
    findings.push({
      code: "WASM_DEFERRED",
      message: "WASM execution is deferred from the Phase 1 baseline.",
    });
  }

  if (
    boundary.limits.timeoutMs <= 0 ||
    boundary.limits.memoryMb <= 0 ||
    boundary.limits.concurrentInvocations <= 0 ||
    boundary.limits.requestBytes <= 0 ||
    boundary.limits.responseBytes <= 0 ||
    boundary.limits.logBytes <= 0
  ) {
    findings.push({
      code: "LIMIT_INVALID",
      message: "All extension resource limits must be positive.",
    });
  }

  for (const host of boundary.outboundHosts ?? []) {
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "169.254.169.254" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      findings.push({
        code: "PRIVATE_NETWORK_FORBIDDEN",
        message: `Private/metadata network host is forbidden: ${host}`,
      });
    }
  }

  return { valid: findings.length === 0, findings };
}

export function phase1ExecutionModes(): readonly ExtensionExecutionMode[] {
  return ["worker", "remote"];
}
