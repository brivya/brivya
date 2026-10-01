export const businessAgentManifestSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://brivya.dev/schemas/business-agent-manifest/v0alpha1",
  type: "object",
  additionalProperties: false,
  required: [
    "apiVersion",
    "kind",
    "metadata",
    "identity",
    "discovery",
    "capabilities",
    "security"
  ],
  properties: {
    apiVersion: {
      const: "brivya.dev/v0alpha1"
    },
    kind: {
      const: "BusinessAgent"
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "version"],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          pattern: "^[a-z0-9][a-z0-9._-]*$"
        },
        name: {
          type: "string",
          minLength: 1
        },
        version: {
          type: "string",
          pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$"
        },
        labels: {
          type: "object",
          additionalProperties: {
            type: "string"
          }
        }
      }
    },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["canonicalUrl", "domains"],
      properties: {
        canonicalUrl: {
          type: "string",
          minLength: 1
        },
        domains: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1
          }
        }
      }
    },
    discovery: {
      type: "object",
      additionalProperties: false,
      required: ["public", "locales"],
      properties: {
        public: {
          type: "boolean"
        },
        locales: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 2
          }
        }
      }
    },
    capabilities: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref"],
        properties: {
          ref: {
            type: "string",
            minLength: 3,
            pattern: "^[a-z0-9][a-z0-9._-]*\\.[a-z0-9][a-z0-9._-]*$"
          },
          version: {
            type: "string",
            pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$"
          }
        }
      }
    },
    protocols: {
      type: "object",
      additionalProperties: false,
      properties: {
        mcp: {
          "$ref": "#/$defs/protocolEndpoint"
        },
        a2a: {
          "$ref": "#/$defs/protocolEndpoint"
        },
        rest: {
          "$ref": "#/$defs/protocolEndpoint"
        }
      }
    },
    security: {
      type: "object",
      additionalProperties: false,
      required: ["defaultAuth", "audit"],
      properties: {
        defaultAuth: {
          type: "string",
          minLength: 1
        },
        audit: {
          enum: ["required", "optional"]
        },
        scopes: {
          type: "object",
          additionalProperties: {
            type: "array",
            uniqueItems: true,
            items: {
              type: "string",
              minLength: 1
            }
          }
        }
      }
    },
    connectors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "credentialRef"],
        properties: {
          id: {
            type: "string",
            minLength: 1
          },
          type: {
            type: "string",
            minLength: 1
          },
          credentialRef: {
            type: "string",
            pattern: "^secret://[A-Za-z0-9._/-]+$"
          }
        }
      }
    },
    runtime: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: {
          enum: ["stateful", "stateless"]
        },
        region: {
          type: "string",
          minLength: 1
        }
      }
    }
  },
  "$defs": {
    protocolEndpoint: {
      type: "object",
      additionalProperties: false,
      required: ["enabled"],
      properties: {
        enabled: {
          type: "boolean"
        },
        endpoint: {
          type: "string"
        },
        basePath: {
          type: "string"
        }
      }
    }
  }
} as const;
