import type {
  BusinessAgentManifest,
} from "@brivya/sdk";

export interface ManifestInspection {
  business: {
    id: string;
    name: string;
    version: string;
    canonicalUrl: string;
    domains: string[];
  };
  discovery: {
    public: boolean;
    locales: string[];
  };
  capabilities: Array<{
    ref: string;
    version?: string;
  }>;
  protocols: string[];
  security: {
    defaultAuth: string;
    audit: string;
    declaredScopeGroups: string[];
  };
  connectors: Array<{
    id: string;
    type: string;
    credentialBound: boolean;
  }>;
  runtime?: {
    mode: string;
    region?: string;
  };
}

export function inspectManifest(
  manifest: BusinessAgentManifest,
): ManifestInspection {
  return {
    business: {
      id: manifest.metadata.id,
      name: manifest.metadata.name,
      version: manifest.metadata.version,
      canonicalUrl: manifest.identity.canonicalUrl,
      domains: [...manifest.identity.domains],
    },
    discovery: {
      public: manifest.discovery.public,
      locales: [...manifest.discovery.locales],
    },
    capabilities: manifest.capabilities.map(
      (capability) => ({
        ref: capability.ref,
        version: capability.version,
      }),
    ),
    protocols: Object.entries(
      manifest.protocols ?? {},
    )
      .filter(([, config]) => config?.enabled)
      .map(([name]) => name)
      .sort(),
    security: {
      defaultAuth: manifest.security.defaultAuth,
      audit: manifest.security.audit,
      declaredScopeGroups: Object.keys(
        manifest.security.scopes ?? {},
      ).sort(),
    },
    connectors: (manifest.connectors ?? []).map(
      (connector) => ({
        id: connector.id,
        type: connector.type,
        credentialBound:
          connector.credentialRef.startsWith(
            "secret://",
          ),
      }),
    ),
    runtime: manifest.runtime
      ? {
          mode: manifest.runtime.mode,
          region: manifest.runtime.region,
        }
      : undefined,
  };
}
