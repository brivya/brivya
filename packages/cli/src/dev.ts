import {
  BrivyaError,
  FunctionConnectorExecutor,
  createLocalRuntime,
  loadManifest,
  type BusinessAgentManifest,
  type CapabilityContract,
  type LocalRuntime,
} from "@brivya/sdk";

export interface DevProfile {
  schemaVersion: 1;
  capabilities: CapabilityContract[];
  responses: Record<string, unknown>;
}

export interface DevSession extends LocalRuntime {
  manifest: BusinessAgentManifest;
  profile: DevProfile;
  descriptor: {
    mode: "local";
    cloudRequired: false;
    businessId: string;
    capabilityCount: number;
    manifestCapabilityCount: number;
    protocols: string[];
  };
}

export function createDevSession(
  manifestSource: string,
  profileSource: string,
): DevSession {
  const manifest = loadManifest(manifestSource);
  const profile = parseDevProfile(profileSource);

  const local = createLocalRuntime({
    capabilities: profile.capabilities,
    connector: new FunctionConnectorExecutor(
      async ({ capability }) => {
        const key = capabilityKey(capability);
        if (!(key in profile.responses)) {
          throw new BrivyaError(
            "CONNECTOR_ERROR",
            `No local dev response is configured for ${key}.`,
            {
              details: {
                capability: capability.id,
                version: capability.version,
                reason: "dev_response_missing",
              },
            },
          );
        }
        return structuredClone(profile.responses[key]);
      },
    ),
  });

  for (const reference of manifest.capabilities) {
    local.registry.resolve(
      reference.ref,
      reference.version,
    );
  }

  return {
    ...local,
    manifest,
    profile,
    descriptor: {
      mode: "local",
      cloudRequired: false,
      businessId: manifest.metadata.id,
      capabilityCount: profile.capabilities.length,
      manifestCapabilityCount:
        manifest.capabilities.length,
      protocols: Object.entries(
        manifest.protocols ?? {},
      )
        .filter(([, config]) => config?.enabled)
        .map(([name]) => name)
        .sort(),
    },
  };
}

export function parseDevProfile(
  source: string,
): DevProfile {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new BrivyaError(
      "INVALID_INPUT",
      "Unable to parse brivya.dev.json.",
      { cause: error },
    );
  }

  if (!isRecord(value)) {
    throw invalidProfile(
      "Dev profile must be a JSON object.",
    );
  }

  if (value.schemaVersion !== 1) {
    throw invalidProfile(
      "Dev profile schemaVersion must be 1.",
    );
  }

  if (!Array.isArray(value.capabilities)) {
    throw invalidProfile(
      "Dev profile capabilities must be an array.",
    );
  }

  if (!isRecord(value.responses)) {
    throw invalidProfile(
      "Dev profile responses must be an object.",
    );
  }

  for (const [index, item] of value.capabilities.entries()) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.version !== "string" ||
      typeof item.mode !== "string" ||
      typeof item.description !== "string" ||
      typeof item.resource !== "string"
    ) {
      throw invalidProfile(
        `Dev capability at index ${index} is not a valid CapabilityContract shape.`,
      );
    }
  }

  return {
    schemaVersion: 1,
    capabilities:
      value.capabilities as unknown as CapabilityContract[],
    responses: value.responses,
  };
}

export function capabilityKey(
  capability: Pick<
    CapabilityContract,
    "id" | "version"
  >,
): string {
  return `${capability.id}@${capability.version}`;
}

function invalidProfile(
  message: string,
): BrivyaError {
  return new BrivyaError(
    "INVALID_INPUT",
    message,
    {
      details: {
        file: "brivya.dev.json",
      },
    },
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
