import type { DistributionProfile } from "@brivya/distribution";

export const wechatAiProfile: DistributionProfile = {
  apiVersion: "brivya.dev/v0alpha2",
  kind: "DistributionProfile",
  metadata: {
    id: "wechat-ai",
    displayName: "WeChat AI",
    version: "0.1.0",
  },
  target: {
    category: "traffic-platform",
  },
  support: {
    generate: true,
    validate: true,
    preview: true,
    guidedPublish: true,
    apiPublish: false,
    statusSync: false,
  },
  invocation: {
    protocols: ["mcp"],
    toolProjection: "generated",
  },
  identity: {
    trustedContext: "platform",
    selfAssertedIdentity: "forbidden",
    delegationMapping: "explicit",
  },
  experience: {
    semanticContract: "brivya.semantic/v0alpha1",
    renderer: "platform-native",
  },
  packaging: {
    format: "wechat-ai-skill-package",
  },
  validation: {
    schemaParity: "required",
    policyPreservation: "required",
    identityBoundary: "required",
    renderValidation: "required",
  },
  publication: {
    manualReview: true,
    businessVerification: true,
  },
};
