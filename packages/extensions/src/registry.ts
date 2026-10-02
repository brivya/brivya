import type { ExtensionManifest, ExtensionType } from "./manifest.js";
import {
  detectPermissionExpansion,
  permissionRisk,
  type PermissionRisk,
} from "./permissions.js";

export type RegistryVersionState =
  | "draft"
  | "published"
  | "deprecated"
  | "yanked"
  | "quarantined"
  | "revoked";

export interface RegistryPackageRecord {
  id: string;
  version: string;
  type: ExtensionType;
  publisher: {
    id: string;
    verified: boolean;
  };
  artifact: {
    digest: string;
    signature?: string;
    provenance?: string;
  };
  compatibility: {
    brivya: string;
  };
  permissions: readonly string[];
  dependencies: readonly string[];
  status: RegistryVersionState;
}

export interface RegistryClient {
  getPackage(id: string, version: string): Promise<RegistryPackageRecord | undefined>;
  listVersions(id: string): Promise<readonly RegistryPackageRecord[]>;
}

export interface ExtensionInstallPlan {
  coordinate: string;
  requestedPermissions: readonly string[];
  permissionRisks: Readonly<Record<string, PermissionRisk>>;
  dependencies: readonly string[];
  requiresExplicitApproval: boolean;
  requiresReapproval: boolean;
  permissionExpansion: {
    addedPermissions: readonly string[];
    addedNetworkHosts: readonly string[];
  };
  activationAllowed: false;
}

export function createInstallPlan(
  manifest: ExtensionManifest,
  options: {
    previousManifest?: ExtensionManifest;
  } = {},
): ExtensionInstallPlan {
  const previous = options.previousManifest;
  const expansion = detectPermissionExpansion(
    {
      permissions: previous?.permissions ?? [],
      networkHosts: previous?.network?.outbound?.hosts ?? [],
    },
    {
      permissions: manifest.permissions,
      networkHosts: manifest.network?.outbound?.hosts ?? [],
    },
  );

  const permissionRisks = Object.fromEntries(
    manifest.permissions.map((permission) => [
      permission,
      permissionRisk(permission),
    ]),
  );

  const hasHighRisk = Object.values(permissionRisks).includes("high");

  return {
    coordinate: `${manifest.metadata.publisher}/${manifest.metadata.name}@${manifest.metadata.version}`,
    requestedPermissions: [...manifest.permissions],
    permissionRisks,
    dependencies: (manifest.dependencies ?? []).map(
      (dependency) => `${dependency.coordinate}@${dependency.version}`,
    ),
    requiresExplicitApproval: hasHighRisk || !previous,
    requiresReapproval: Boolean(previous) && expansion.requiresReapproval,
    permissionExpansion: {
      addedPermissions: expansion.addedPermissions,
      addedNetworkHosts: expansion.addedNetworkHosts,
    },
    activationAllowed: false,
  };
}

export class InMemoryRegistryClient implements RegistryClient {
  private readonly records = new Map<string, RegistryPackageRecord>();

  constructor(records: readonly RegistryPackageRecord[] = []) {
    for (const record of records) {
      this.records.set(`${record.id}@${record.version}`, record);
    }
  }

  async getPackage(
    id: string,
    version: string,
  ): Promise<RegistryPackageRecord | undefined> {
    return this.records.get(`${id}@${version}`);
  }

  async listVersions(id: string): Promise<readonly RegistryPackageRecord[]> {
    return [...this.records.values()].filter((record) => record.id === id);
  }
}
