# @brivya/adapter-mcp

MCP v2 projection over the canonical Brivya `BusinessRuntime`.

The adapter uses the official `@modelcontextprotocol/server` v2 SDK and projects each registered Brivya Capability as an MCP tool.

## Tool projection

A capability such as:

```text
order.create@0.1.0
```

is projected as:

```text
brivya.order.create.v0.1.0
```

Capability input/output JSON Schemas are passed through the MCP SDK using `fromJsonSchema`.

MCP annotations are hints only. They are never treated as authorization.

## Security boundary

Tool arguments are business input only.

A model/tool caller cannot grant itself:

- principal identity;
- delegated scopes;
- approvals.

The hosting MCP transport/auth layer supplies a trusted `McpContextResolver`, which may map verified session/OAuth state into:

- actor
- principal
- delegation
- approval evidence
- idempotency / correlation metadata

If no trusted resolver is configured, the default context contains only an untrusted Agent actor. Protected capabilities therefore fail closed in `BusinessRuntime`.

## Runtime authority

The MCP adapter never:

- performs business authorization;
- bypasses Policy;
- synthesizes Approval;
- executes Connectors directly;
- calls shell commands;
- depends on an LLM provider SDK.

All business execution flows through `BusinessRuntime.execute()`.
