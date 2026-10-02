import {
  loadBusinessAgentManifest,
  parseBusinessAgentManifest,
  validateBusinessAgentManifest,
  type BusinessAgentManifest,
  type ManifestValidationOptions,
  type ManifestValidationResult,
} from "@brivya/manifest";

export function loadManifest(
  source: string,
  options: ManifestValidationOptions = {},
): BusinessAgentManifest {
  return loadBusinessAgentManifest(source, options);
}

export function validateManifest(
  source: string,
  options: ManifestValidationOptions = {},
): ManifestValidationResult {
  const parsed = parseBusinessAgentManifest(source);
  return validateBusinessAgentManifest(parsed, options);
}
