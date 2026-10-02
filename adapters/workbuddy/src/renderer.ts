import type { CapabilityContract } from "@brivya/core";
import {
  projectCapability,
  validateCapabilityProjection,
  type CapabilityProjection,
} from "@brivya/distribution";

export interface WorkBuddyBusinessMetadata {
  id: string;
  name: string;
  description: string;
  locale?: string;
  mcpEndpoint: string;
  authMode: string;
}

export interface WorkBuddyPackage {
  artifacts: Readonly<Record<string, string>>;
  projections: readonly CapabilityProjection[];
}

export function renderWorkBuddyPackage(
  business: WorkBuddyBusinessMetadata,
  capabilities: readonly CapabilityContract[],
): WorkBuddyPackage {
  const projections = capabilities.map(projectCapability);

  for (let index = 0; index < capabilities.length; index += 1) {
    const canonical = capabilities[index];
    const projected = projections[index];
    if (!canonical || !projected) continue;
    const result = validateCapabilityProjection(canonical, projected);
    if (result.status === "fail") {
      throw new Error(`Unsafe WorkBuddy projection for ${canonical.id}.`);
    }
  }

  const connectorMeta = {
    name: business.name,
    description: business.description,
    locale: business.locale ?? "en",
    transport: {
      protocol: "mcp",
      endpoint: business.mcpEndpoint,
    },
    auth: {
      mode: business.authMode,
    },
    capabilities: projections.map((item) => ({
      id: item.id,
      version: item.version,
      risk: item.risk,
      approval: item.approval,
      permissions: item.permissions,
    })),
  };

  const mcp = {
    tools: projections.map((item) => ({
      name: item.id,
      version: item.version,
      inputSchema: item.inputSchema,
      outputSchema: item.outputSchema,
      _meta: {
        "brivya/risk": item.risk,
        "brivya/approval": item.approval,
        "brivya/permissions": item.permissions,
        "brivya/idempotencyRequired": item.idempotencyRequired,
      },
    })),
  };

  const skill = [
    "---",
    `name: ${business.id}`,
    `description: ${business.description}`,
    'platform: ["workbuddy"]',
    "---",
    "",
    `# ${business.name}`,
    "",
    "Use only the declared Brivya capability IDs below.",
    "Do not infer authorization from discovery or agent identity.",
    "",
    ...projections.map(
      (item) =>
        `- ${item.id}@${item.version}: risk=${item.risk}, approval=${item.approval}`,
    ),
  ].join("\n");

  return {
    projections,
    artifacts: {
      "connector-meta.json": JSON.stringify(connectorMeta, null, 2),
      "mcp.json": JSON.stringify(mcp, null, 2),
      "skills/business/SKILL.md": skill,
    },
  };
}
