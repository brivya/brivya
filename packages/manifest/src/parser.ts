import { parse } from "yaml";

import type { BusinessAgentManifest } from "./types.js";
import {
  validateBusinessAgentManifest,
  type ManifestValidationIssue,
  type ManifestValidationOptions,
} from "./validate.js";

export class ManifestParseError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = "ManifestParseError";
  }
}

export class ManifestValidationError extends Error {
  readonly issues: ManifestValidationIssue[];

  constructor(issues: ManifestValidationIssue[]) {
    super(
      `Business Agent Manifest validation failed with ${issues.length} issue(s).`,
    );
    this.name = "ManifestValidationError";
    this.issues = issues;
  }
}

export function parseBusinessAgentManifest(source: string): unknown {
  try {
    return parse(source);
  } catch (error) {
    throw new ManifestParseError("Unable to parse Business Agent Manifest YAML.", {
      cause: error,
    });
  }
}

export function loadBusinessAgentManifest(
  source: string,
  options: ManifestValidationOptions = {},
): BusinessAgentManifest {
  const parsed = parseBusinessAgentManifest(source);
  const result = validateBusinessAgentManifest(parsed, options);

  if (!result.valid || !result.manifest) {
    throw new ManifestValidationError(result.issues);
  }

  return result.manifest;
}
