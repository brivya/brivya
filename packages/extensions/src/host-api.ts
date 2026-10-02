import { permissionAllows } from "./permissions.js";

export type ExtensionHostErrorCode =
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "VERSION_UNSUPPORTED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "HOST_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ExtensionHostError extends Error {
  readonly code: ExtensionHostErrorCode;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ExtensionHostErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message);
    this.name = "ExtensionHostError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? {};
  }
}

export interface OpaqueSecretBinding {
  bindingId: string;
  reference: string;
  expiresAt?: string;
}

export interface ExtensionHostBindings {
  readBusiness?(): unknown | Promise<unknown>;
  registerCapability?(definition: unknown): unknown | Promise<unknown>;
  executeCapability?(
    capabilityId: string,
    request: unknown,
  ): unknown | Promise<unknown>;
  registerWorkflow?(definition: unknown): unknown | Promise<unknown>;
  emitTelemetry?(event: unknown): void | Promise<void>;
  networkRequest?(
    url: string,
    init?: Readonly<Record<string, unknown>>,
  ): unknown | Promise<unknown>;
  getState?(key: string): unknown | Promise<unknown>;
  putState?(key: string, value: unknown): void | Promise<void>;
  requestSecretBinding?(reference: string): OpaqueSecretBinding | Promise<OpaqueSecretBinding>;
  registerUi?(descriptor: unknown): unknown | Promise<unknown>;
  registerDistribution?(descriptor: unknown): unknown | Promise<unknown>;
}

export interface ExtensionHostSessionOptions {
  extensionId: string;
  hostApiVersion?: "0.1";
  grantedPermissions: readonly string[];
  outboundHosts?: readonly string[];
  bindings?: ExtensionHostBindings;
}

export class ExtensionHostSession {
  readonly hostApiVersion = "0.1" as const;
  readonly extensionId: string;
  readonly grantedPermissions: readonly string[];

  private readonly outboundHosts: Set<string>;
  private readonly bindings: ExtensionHostBindings;

  constructor(options: ExtensionHostSessionOptions) {
    this.extensionId = options.extensionId;
    this.grantedPermissions = [...new Set(options.grantedPermissions)].sort();
    this.outboundHosts = new Set(options.outboundHosts ?? []);
    this.bindings = options.bindings ?? {};
  }

  async businessRead(): Promise<unknown> {
    this.require("business:read");
    return this.call("business.read", this.bindings.readBusiness);
  }

  async capabilityRegister(definition: unknown): Promise<unknown> {
    this.require("capability:register");
    return this.call(
      "capability.register",
      this.bindings.registerCapability,
      definition,
    );
  }

  async capabilityExecute(
    capabilityId: string,
    request: unknown,
  ): Promise<unknown> {
    this.require(`capability:execute:${capabilityId}`);
    return this.call(
      "capability.execute",
      this.bindings.executeCapability,
      capabilityId,
      request,
    );
  }

  async workflowRegister(definition: unknown): Promise<unknown> {
    this.require("workflow:register");
    return this.call(
      "workflow.register",
      this.bindings.registerWorkflow,
      definition,
    );
  }

  async telemetryEmit(event: unknown): Promise<void> {
    this.require("telemetry:emit");
    await this.call("telemetry.emit", this.bindings.emitTelemetry, event);
  }

  async networkRequest(
    url: string,
    init?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    this.require("network:outbound");
    const parsed = new URL(url);
    if (!this.outboundHosts.has(parsed.hostname)) {
      throw new ExtensionHostError(
        "PERMISSION_DENIED",
        `Outbound host is not allowlisted: ${parsed.hostname}`,
        { details: { host: parsed.hostname } },
      );
    }
    return this.call(
      "network.request",
      this.bindings.networkRequest,
      url,
      init,
    );
  }

  async stateGet(key: string): Promise<unknown> {
    return this.call("state.get", this.bindings.getState, key);
  }

  async statePut(key: string, value: unknown): Promise<void> {
    await this.call("state.put", this.bindings.putState, key, value);
  }

  async secretRequestBinding(reference: string): Promise<OpaqueSecretBinding> {
    this.require("secret:reference");
    this.require("secret:request");
    if (!reference.startsWith("secret://")) {
      throw new ExtensionHostError(
        "INVALID_ARGUMENT",
        "Secret binding requests must use secret:// references.",
      );
    }
    return this.call(
      "secret.requestBinding",
      this.bindings.requestSecretBinding,
      reference,
    ) as Promise<OpaqueSecretBinding>;
  }

  async uiRegister(descriptor: unknown): Promise<unknown> {
    this.require("ui:register");
    return this.call("ui.register", this.bindings.registerUi, descriptor);
  }

  async distributionRegister(descriptor: unknown): Promise<unknown> {
    this.require("distribution:register");
    return this.call(
      "distribution.register",
      this.bindings.registerDistribution,
      descriptor,
    );
  }

  private require(permission: string): void {
    if (!permissionAllows(this.grantedPermissions, permission)) {
      throw new ExtensionHostError(
        "PERMISSION_DENIED",
        `Extension permission required: ${permission}`,
        { details: { permission } },
      );
    }
  }

  private async call(
    name: string,
    fn: ((...args: any[]) => unknown | Promise<unknown>) | undefined,
    ...args: unknown[]
  ): Promise<any> {
    if (!fn) {
      throw new ExtensionHostError(
        "HOST_UNAVAILABLE",
        `Host binding is unavailable: ${name}`,
        { retryable: true },
      );
    }
    return fn(...args);
  }
}
