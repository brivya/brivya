import type { CapabilityContract } from "@brivya/core";

import type { SemanticExperience } from "./semantic-experience.js";

export interface ExperienceFinding {
  code: string;
  severity: "warning" | "error";
  path: string;
  message: string;
}

export interface ExperienceValidationResult {
  status: "pass" | "warn" | "fail";
  findings: readonly ExperienceFinding[];
}

export interface ExperienceValidationContext {
  capabilities?: readonly Pick<CapabilityContract, "id" | "mode" | "approval">[];
  resourceFields?: Readonly<Record<string, readonly string[]>>;
}

export function validateSemanticExperience(
  experience: SemanticExperience,
  context: ExperienceValidationContext = {},
): ExperienceValidationResult {
  const findings: ExperienceFinding[] = [];

  if (!experience.metadata.id.trim()) {
    findings.push(error("EXPERIENCE_ID_REQUIRED", "metadata.id", "Experience id is required."));
  }

  const capabilityMap = new Map(
    (context.capabilities ?? []).map((capability) => [capability.id, capability]),
  );

  const actionIds = new Set<string>();
  for (const [index, action] of (experience.actions ?? []).entries()) {
    const path = `actions[${index}]`;

    if (actionIds.has(action.id)) {
      findings.push(error("EXPERIENCE_ACTION_DUPLICATE", `${path}.id`, `Duplicate action id: ${action.id}`));
    }
    actionIds.add(action.id);

    if (action.type === "capability") {
      if (!action.capability) {
        findings.push(error("EXPERIENCE_CAPABILITY_REQUIRED", `${path}.capability`, "Capability action must reference a capability."));
        continue;
      }

      const capability = capabilityMap.get(action.capability);
      if (context.capabilities && !capability) {
        findings.push(error("EXPERIENCE_CAPABILITY_UNKNOWN", `${path}.capability`, `Unknown capability: ${action.capability}`));
        continue;
      }

      if (
        capability?.mode === "mutation" &&
        action.interaction?.confirmation === "none" &&
        capability.approval !== "none"
      ) {
        findings.push(warning(
          "EXPERIENCE_CONFIRMATION_WEAKER_THAN_CAPABILITY",
          `${path}.interaction.confirmation`,
          "UI confirmation intent does not change Runtime approval requirements.",
        ));
      }
    } else if (action.capability) {
      findings.push(error(
        "EXPERIENCE_CAPABILITY_UNBOUND",
        `${path}.capability`,
        "Only capability actions may bind a Capability ID.",
      ));
    }
  }

  const resource = experience.view.resource;
  if (resource && context.resourceFields?.[resource]) {
    const allowed = new Set(context.resourceFields[resource]);
    for (const [index, field] of (experience.fields ?? []).entries()) {
      if (!allowed.has(field.path)) {
        findings.push(error(
          "EXPERIENCE_FIELD_UNKNOWN",
          `fields[${index}].path`,
          `Field ${field.path} is not declared by resource ${resource}.`,
        ));
      }
    }
  }

  return result(findings);
}

function result(findings: ExperienceFinding[]): ExperienceValidationResult {
  return {
    status: findings.some((finding) => finding.severity === "error")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
  };
}

function error(code: string, path: string, message: string): ExperienceFinding {
  return { code, severity: "error", path, message };
}

function warning(code: string, path: string, message: string): ExperienceFinding {
  return { code, severity: "warning", path, message };
}
