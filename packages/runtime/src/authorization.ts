import {
  BrivyaError,
  type ActionRequest,
  type CapabilityContract,
} from "@brivya/core";

export interface AuthorizationContext {
  principalId?: string;
  grantedScopes: readonly string[];
}

export interface Authorizer {
  authorize(
    capability: CapabilityContract,
    request: ActionRequest,
  ): AuthorizationContext | Promise<AuthorizationContext>;
}

export interface DefaultAuthorizerOptions {
  now?: () => Date;
}

export class DefaultAuthorizer implements Authorizer {
  readonly #now: () => Date;

  constructor(options: DefaultAuthorizerOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  authorize(
    capability: CapabilityContract,
    request: ActionRequest,
  ): AuthorizationContext {
    if (capability.permissions.length === 0) {
      return {
        principalId: request.principal?.id,
        grantedScopes: request.delegation?.scopes ?? [],
      };
    }

    if (!request.principal) {
      throw new BrivyaError(
        "UNAUTHORIZED",
        "A protected capability requires an explicit principal. Actor identity alone never grants authorization.",
        {
          details: {
            capability: capability.id,
            required_scopes: capability.permissions,
          },
        },
      );
    }

    if (!request.delegation) {
      throw new BrivyaError(
        "UNAUTHORIZED",
        "A protected capability requires delegation/authorization evidence.",
        {
          details: {
            capability: capability.id,
            principal: request.principal.id,
            required_scopes: capability.permissions,
          },
        },
      );
    }

    if (request.delegation.expiresAt) {
      const expiresAt = Date.parse(request.delegation.expiresAt);
      if (Number.isNaN(expiresAt) || expiresAt <= this.#now().getTime()) {
        throw new BrivyaError(
          "UNAUTHORIZED",
          "Delegation is expired or has an invalid expiration timestamp.",
          {
            details: {
              capability: capability.id,
              expires_at: request.delegation.expiresAt,
            },
          },
        );
      }
    }

    const granted = new Set(request.delegation.scopes);
    const missing = capability.permissions.filter(
      (permission) => !granted.has(permission),
    );

    if (missing.length > 0) {
      throw new BrivyaError(
        "UNAUTHORIZED",
        "Delegation does not grant all scopes required by the capability.",
        {
          details: {
            capability: capability.id,
            missing_scopes: missing,
            granted_scopes: [...granted].sort(),
          },
        },
      );
    }

    return {
      principalId: request.principal.id,
      grantedScopes: [...granted].sort(),
    };
  }
}
