import type {
  ActionRequest,
  CapabilityContract,
  PolicyDecision,
  PolicyObligation,
} from "@brivya/core";

export interface PolicyEvaluationContext<Input = unknown> {
  capability: CapabilityContract;
  request: ActionRequest<Input>;
}

export interface PolicyEngine {
  evaluate(
    context: PolicyEvaluationContext,
  ): PolicyDecision | Promise<PolicyDecision>;
}

export type PolicyRule =
  (
    context: PolicyEvaluationContext,
  ) =>
    | PolicyDecision
    | null
    | undefined
    | Promise<PolicyDecision | null | undefined>;

export class RulePolicyEngine implements PolicyEngine {
  readonly #rules: readonly PolicyRule[];

  constructor(rules: readonly PolicyRule[] = []) {
    this.#rules = rules;
  }

  async evaluate(
    context: PolicyEvaluationContext,
  ): Promise<PolicyDecision> {
    const reasons: string[] = [];
    const obligations: PolicyObligation[] = [];
    let requiresApproval = false;

    for (const rule of this.#rules) {
      const result = await rule(context);
      if (!result) {
        continue;
      }

      reasons.push(...result.reasons);
      obligations.push(...result.obligations);

      if (result.decision === "deny") {
        return {
          decision: "deny",
          reasons,
          obligations,
        };
      }

      if (result.decision === "require_approval") {
        requiresApproval = true;
      }
    }

    return {
      decision: requiresApproval ? "require_approval" : "allow",
      reasons,
      obligations,
    };
  }
}

export function allow(
  reason = "policy_allowed",
  obligations: readonly PolicyObligation[] = [],
): PolicyDecision {
  return {
    decision: "allow",
    reasons: [reason],
    obligations,
  };
}

export function deny(
  reason: string,
  obligations: readonly PolicyObligation[] = [],
): PolicyDecision {
  return {
    decision: "deny",
    reasons: [reason],
    obligations,
  };
}

export function requireApproval(
  reason: string,
  obligations: readonly PolicyObligation[] = [],
): PolicyDecision {
  return {
    decision: "require_approval",
    reasons: [reason],
    obligations,
  };
}
