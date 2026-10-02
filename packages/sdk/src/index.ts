/**
 * Brivya TypeScript SDK.
 *
 * This package is deliberately a facade over the canonical public contracts.
 * It does not implement an alternate runtime, policy engine, approval model,
 * or authorization path.
 */
export * as core from "@brivya/core";
export * as manifest from "@brivya/manifest";
export * as policy from "@brivya/policy";
export * as runtime from "@brivya/runtime";

export type {
  ActionRequest,
  Actor,
  ApprovalRecord,
  CapabilityContract,
  Delegation,
  Principal,
} from "@brivya/core";

export type {
  BusinessAgentManifest,
  ManifestValidationOptions,
  ManifestValidationResult,
} from "@brivya/manifest";

export {
  loadBusinessAgentManifest,
  parseBusinessAgentManifest,
  validateBusinessAgentManifest,
} from "@brivya/manifest";

export {
  BusinessRuntime,
  CapabilityRegistry,
} from "@brivya/runtime";
