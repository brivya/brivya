import type { DistributionProfile } from "@brivya/distribution";

export const workbuddyProfile: DistributionProfile = {
  apiVersion: "brivya.dev/v0alpha2",
  kind: "DistributionProfile",
  metadata: {
    id: "workbuddy",
    displayName: "WorkBuddy",
    version: "0.1.0",
  },
  target: {
    category: "capability-ecosystem",
  },
  support: {
    generate: true,
    validate: true,
    preview: false,
    guidedPublish: true,
    apiPublish: false,
    statusSync: false,
  },
  invocation: {
    protocols: ["mcp"],
    toolProjection: "generated",
  },
  identity: {
    trustedContext: "adapter",
    selfAssertedIdentity: "forbidden",
    delegationMapping: "explicit",
  },
  experience: {
    semanticContract: "brivya.semantic/v0alpha1",
    renderer: "structured",
  },
  packaging: {
    format: "workbuddy-reference-package",
  },
  validation: {
    schemaParity: "required",
    policyPreservation: "required",
    identityBoundary: "required",
    renderValidation: "optional",
  },
  publication: {
    manualReview: true,
    businessVerification: false,
  },
};
