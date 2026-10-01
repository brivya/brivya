import {
  BrivyaError,
  type CapabilityContract,
} from "@brivya/core";

export class CapabilityRegistry {
  readonly #byId = new Map<string, Map<string, CapabilityContract>>();

  register(capability: CapabilityContract): void {
    let versions = this.#byId.get(capability.id);
    if (!versions) {
      versions = new Map();
      this.#byId.set(capability.id, versions);
    }

    if (versions.has(capability.version)) {
      throw new BrivyaError(
        "CONFLICT",
        `Capability ${capability.id}@${capability.version} is already registered.`,
        {
          details: {
            capability: capability.id,
            version: capability.version,
          },
        },
      );
    }

    versions.set(capability.version, capability);
  }

  resolve(id: string, version?: string): CapabilityContract {
    const versions = this.#byId.get(id);
    if (!versions || versions.size === 0) {
      throw new BrivyaError(
        "CAPABILITY_UNAVAILABLE",
        `Capability ${id} is not registered.`,
        { details: { capability: id } },
      );
    }

    if (version) {
      const capability = versions.get(version);
      if (!capability) {
        throw new BrivyaError(
          "CAPABILITY_UNAVAILABLE",
          `Capability ${id}@${version} is not registered.`,
          {
            details: {
              capability: id,
              requested_version: version,
              available_versions: [...versions.keys()].sort(),
            },
          },
        );
      }
      return capability;
    }

    if (versions.size > 1) {
      throw new BrivyaError(
        "CONFLICT",
        `Capability ${id} has multiple registered versions; an explicit version is required.`,
        {
          details: {
            capability: id,
            available_versions: [...versions.keys()].sort(),
          },
        },
      );
    }

    return versions.values().next().value as CapabilityContract;
  }

  list(): CapabilityContract[] {
    return [...this.#byId.values()]
      .flatMap((versions) => [...versions.values()])
      .sort((a, b) =>
        `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`),
      );
  }
}
