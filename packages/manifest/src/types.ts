export interface BusinessAgentMetadata {
  id: string;
  name: string;
  version: string;
  labels?: Record<string, string>;
}

export interface BusinessAgentIdentity {
  canonicalUrl: string;
  domains: string[];
}

export interface BusinessAgentDiscovery {
  public: boolean;
  locales: string[];
}

export interface CapabilityReference {
  ref: string;
  version?: string;
}

export interface ProtocolEndpoint {
  enabled: boolean;
  endpoint?: string;
  basePath?: string;
}

export interface BusinessAgentProtocols {
  mcp?: ProtocolEndpoint;
  a2a?: ProtocolEndpoint;
  rest?: ProtocolEndpoint;
}

export interface BusinessAgentSecurity {
  defaultAuth: string;
  audit: "required" | "optional";
  scopes?: Record<string, string[]>;
}

export interface ConnectorReference {
  id: string;
  type: string;
  credentialRef: string;
}

export interface BusinessAgentRuntime {
  mode: "stateful" | "stateless";
  region?: string;
}

export interface BusinessAgentManifest {
  apiVersion: "brivya.dev/v0alpha1";
  kind: "BusinessAgent";
  metadata: BusinessAgentMetadata;
  identity: BusinessAgentIdentity;
  discovery: BusinessAgentDiscovery;
  capabilities: CapabilityReference[];
  protocols?: BusinessAgentProtocols;
  security: BusinessAgentSecurity;
  connectors?: ConnectorReference[];
  runtime?: BusinessAgentRuntime;
}
