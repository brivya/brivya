import {
  BrivyaError,
  type ActionRequest,
  type ApprovalRecord,
  type CapabilityContract,
  type PolicyDecision,
} from "@brivya/core";

import { approvalInputDigest } from "./digest.js";

export interface ApprovalVerificationInput {
  capability: CapabilityContract;
  request: ActionRequest;
  policy: PolicyDecision;
  approvals?: readonly ApprovalRecord[];
}

export interface ApprovalVerifierOptions {
  now?: () => Date;
}

export class ApprovalVerifier {
  readonly #now: () => Date;

  constructor(options: ApprovalVerifierOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  verify(input: ApprovalVerificationInput): void {
    const { capability, request, policy } = input;
    const approvalRequired =
      capability.approval === "required" ||
      capability.approval === "dual_control" ||
      policy.decision === "require_approval";

    if (!approvalRequired) {
      return;
    }

    const expectedDigest = approvalInputDigest(capability, request);
    const approvals = input.approvals ?? [];

    const relevant = approvals.filter(
      (approval) =>
        approval.requestId === request.requestId &&
        approval.capability === capability.id,
    );

    const digestMismatch = relevant.find(
      (approval) => approval.inputDigest !== expectedDigest,
    );
    if (digestMismatch) {
      throw new BrivyaError(
        "CONFLICT",
        "Approval input digest does not match the action being executed.",
        {
          details: {
            capability: capability.id,
            request_id: request.requestId,
            reason: "approval_digest_mismatch",
            expected_digest: expectedDigest,
            received_digest: digestMismatch.inputDigest,
          },
        },
      );
    }

    const now = this.#now().getTime();
    const valid = relevant.filter((approval) => {
      const expiresAt = Date.parse(approval.expiresAt);
      if (Number.isNaN(expiresAt)) {
        return false;
      }
      if (expiresAt <= now) {
        throw new BrivyaError(
          "APPROVAL_EXPIRED",
          "Approval has expired.",
          {
            details: {
              capability: capability.id,
              request_id: request.requestId,
              expires_at: approval.expiresAt,
            },
          },
        );
      }
      return true;
    });

    const requiredCount =
      capability.approval === "dual_control" ? 2 : 1;

    const distinctApprovers = new Set(
      valid.map(
        (approval) =>
          `${approval.approver.type}:${approval.approver.id}`,
      ),
    );

    if (distinctApprovers.size < requiredCount) {
      throw new BrivyaError(
        "APPROVAL_REQUIRED",
        requiredCount === 2
          ? "Dual-control approval requires two distinct approvers."
          : "Approval is required before this action can execute.",
        {
          details: {
            capability: capability.id,
            request_id: request.requestId,
            required_approvals: requiredCount,
            valid_approvals: distinctApprovers.size,
            input_digest: expectedDigest,
          },
        },
      );
    }
  }
}
