export type DistributionTargetCategory =
  | "directory"
  | "channel"
  | "enterprise-store"
  | "capability-ecosystem"
  | "traffic-platform";

export type DistributionCompatibilityState =
  | "compatible"
  | "compatible_with_warnings"
  | "requires_regeneration"
  | "requires_review"
  | "blocked"
  | "unsupported";

export type DistributionPublicationState =
  | "not_generated"
  | "generated"
  | "validated"
  | "previewed"
  | "ready_to_submit"
  | "submitted"
  | "in_review"
  | "published"
  | "update_required"
  | "suspended"
  | "rejected"
  | "unpublished";

export interface DistributionProfile {
  apiVersion: "brivya.dev/v0alpha2";
  kind: "DistributionProfile";
  metadata: {
    id: string;
    displayName: string;
    version: string;
  };
  target: {
    category: DistributionTargetCategory;
  };
  support: {
    generate: boolean;
    validate: boolean;
    preview: boolean;
    guidedPublish: boolean;
    apiPublish: boolean;
    statusSync: boolean;
  };
  invocation: {
    protocols: readonly string[];
    toolProjection: "generated" | "passthrough";
  };
  identity: {
    trustedContext: "platform" | "adapter" | "none";
    selfAssertedIdentity: "forbidden";
    delegationMapping: "explicit" | "unsupported";
  };
  experience: {
    semanticContract: "brivya.semantic/v0alpha1";
    renderer: "platform-native" | "structured";
  };
  packaging: {
    format: string;
  };
  validation: {
    schemaParity: "required";
    policyPreservation: "required";
    identityBoundary: "required";
    renderValidation: "required" | "optional";
  };
  publication: {
    manualReview: boolean;
    businessVerification: boolean;
  };
}

export interface ProjectDistributionTarget {
  profile: string;
  capabilities?: {
    include?: readonly string[];
    exclude?: readonly string[];
  };
  display?: Readonly<Record<string, string>>;
  authRef?: string;
  publication?: Readonly<Record<string, unknown>>;
}
