export type PermissionRisk = "low" | "medium" | "high";

export type ExtensionPermission = string;

export interface ParsedPermission {
  raw: string;
  base: string;
  resource?: string;
}

export const KNOWN_PERMISSION_BASES = new Set([
  "business:read",
  "business:write",
  "capability:read",
  "capability:register",
  "capability:execute",
  "resource:read",
  "resource:write",
  "policy:read",
  "policy:register",
  "policy:evaluate",
  "workflow:read",
  "workflow:register",
  "workflow:execute",
  "secret:reference",
  "secret:request",
  "network:outbound",
  "ui:register",
  "ui:preview",
  "distribution:register",
  "distribution:render",
  "distribution:publish",
  "telemetry:emit",
]);

const HIGH = new Set([
  "capability:execute",
  "workflow:execute",
  "distribution:publish",
  "secret:request",
]);

const MEDIUM = new Set([
  "business:write",
  "capability:register",
  "policy:register",
  "workflow:register",
  "network:outbound",
  "resource:write",
]);

export function normalizePermission(
  permission: string,
): ParsedPermission | undefined {
  const parts = permission.split(":").filter(Boolean);
  if (parts.length < 2) return undefined;

  const base = `${parts[0]}:${parts[1]}`;
  return {
    raw: permission,
    base,
    resource: parts.length > 2 ? parts.slice(2).join(":") : undefined,
  };
}

export function permissionRisk(permission: string): PermissionRisk {
  const parsed = normalizePermission(permission);
  if (!parsed) return "high";
  if (HIGH.has(parsed.base)) return "high";
  if (MEDIUM.has(parsed.base)) return "medium";
  return "low";
}

export interface EffectivePermissionGrant {
  permissions: readonly string[];
}

export function calculateEffectiveGrant(
  requested: readonly string[],
  tenantAllowed: readonly string[],
  adminGranted: readonly string[],
): EffectivePermissionGrant {
  const tenant = new Set(tenantAllowed);
  const admin = new Set(adminGranted);
  const effective = requested.filter(
    (permission) => tenant.has(permission) && admin.has(permission),
  );
  return { permissions: [...new Set(effective)].sort() };
}

export interface PermissionExpansion {
  requiresReapproval: boolean;
  addedPermissions: readonly string[];
  addedNetworkHosts: readonly string[];
}

export function detectPermissionExpansion(
  previous: {
    permissions: readonly string[];
    networkHosts?: readonly string[];
  },
  next: {
    permissions: readonly string[];
    networkHosts?: readonly string[];
  },
): PermissionExpansion {
  const previousPermissions = new Set(previous.permissions);
  const previousHosts = new Set(previous.networkHosts ?? []);

  const addedPermissions = [...new Set(next.permissions)].filter(
    (permission) => !previousPermissions.has(permission),
  );
  const addedNetworkHosts = [...new Set(next.networkHosts ?? [])].filter(
    (host) => !previousHosts.has(host),
  );

  return {
    requiresReapproval:
      addedPermissions.length > 0 || addedNetworkHosts.length > 0,
    addedPermissions,
    addedNetworkHosts,
  };
}

export function permissionAllows(
  granted: readonly string[],
  required: string,
): boolean {
  const exact = new Set(granted);
  if (exact.has(required)) return true;

  const parsedRequired = normalizePermission(required);
  if (!parsedRequired?.resource) return false;

  return exact.has(parsedRequired.base);
}
