export function starterManifest(
  projectId: string,
): string {
  return `apiVersion: brivya.dev/v0alpha1
kind: BusinessAgent

metadata:
  id: ${projectId}
  name: ${humanize(projectId)}
  version: 0.1.0

identity:
  canonicalUrl: http://localhost:8080
  domains:
    - localhost

discovery:
  public: false
  locales:
    - en-US

capabilities: []

protocols:
  rest:
    enabled: true
    basePath: /v0alpha1
  mcp:
    enabled: true
    endpoint: /mcp

security:
  defaultAuth: local-dev
  audit: required

runtime:
  mode: stateful
`;
}

export function starterDevProfile(): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      capabilities: [],
      responses: {},
    },
    null,
    2,
  ) + "\n";
}

export const starterGitignore = `.brivya/
.env
.env.*
node_modules/
dist/
`;

export function normalizeProjectId(
  value: string,
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .replace(/[-._]+$/, "");

  return normalized || "brivya-project";
}

function humanize(value: string): string {
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}
