import type { DistributionProfile } from "./profile.js";

export interface DistributionFinding {
  code: string;
  severity: "warning" | "error";
  path: string;
  message: string;
  remediation?: string;
}

export interface DistributionValidationResult {
  status: "pass" | "warn" | "fail";
  findings: readonly DistributionFinding[];
}

export function validateDistributionProfile(
  profile: DistributionProfile,
): DistributionValidationResult {
  const findings: DistributionFinding[] = [];

  if (!profile.metadata.id.trim()) {
    findings.push(error("PROFILE_ID_REQUIRED", "metadata.id", "Profile id is required."));
  }

  if (!profile.metadata.version.trim()) {
    findings.push(error("PROFILE_VERSION_REQUIRED", "metadata.version", "Profile version is required."));
  }

  if (profile.identity.selfAssertedIdentity !== "forbidden") {
    findings.push(error(
      "PROFILE_SELF_ASSERTED_IDENTITY",
      "identity.selfAssertedIdentity",
      "Self-asserted identity cannot be trusted as authorization evidence.",
    ));
  }

  if (profile.validation.policyPreservation !== "required") {
    findings.push(error(
      "PROFILE_POLICY_PRESERVATION_REQUIRED",
      "validation.policyPreservation",
      "Profile must preserve canonical policy semantics.",
    ));
  }

  if (profile.invocation.protocols.length === 0) {
    findings.push(error(
      "PROFILE_PROTOCOL_REQUIRED",
      "invocation.protocols",
      "At least one invocation protocol/binding is required.",
    ));
  }

  return result(findings);
}

function result(findings: DistributionFinding[]): DistributionValidationResult {
  return {
    status: findings.some((finding) => finding.severity === "error")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
  };
}

function error(
  code: string,
  path: string,
  message: string,
  remediation?: string,
): DistributionFinding {
  return { code, severity: "error", path, message, remediation };
}
