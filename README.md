# Brivya

**Infrastructure for the Agentic Business Web.**

Brivya is open infrastructure for making businesses **agent-accessible**: discoverable, understandable, callable, governable and transactable by AI agents.

> Status: pre-release / v0.1 alpha bootstrap. Public APIs are not stable yet.

## Why Brivya

Businesses already have products, services, inventory, booking systems, order systems, CRM/ERP/POS and payment capabilities. Brivya exposes those capabilities as typed, governed Business Agent contracts instead of relying on prompt-only integrations.

Core flow:

```text
Discover
→ Understand
→ Authorize
→ Act
→ Transact
→ Audit
```

## Architecture principles

- Business-first, not prompt-first
- Protocol-neutral and model-neutral
- Typed Capability contracts
- Agent Identity ≠ Authorization
- Explicit Policy before execution
- Human approval for high-risk actions
- Idempotent mutations
- Auditable transactions
- Open Core

## v0.1.0-alpha.1 scope

The first alpha targets:

- Business Capability Model
- Business Agent Manifest
- Common Types / JSON Schema contracts
- Manifest validator
- Capability Registry
- local/in-memory Runtime
- Policy / Approval primitives
- Transaction / Audit / Event primitives
- TypeScript SDK
- CLI
- REST Adapter
- MCP Adapter
- deterministic mock Connector
- Restaurant reference implementation and contract tests
- Distribution Adapter contract + WorkBuddy reference mapping
- Extension package / permission / host API baseline

A2A / UCP may appear as experimental workspaces after the baseline is healthy.

Python SDK is planned after the TypeScript public API stabilizes.

## Repository shape

```text
packages/
  core/
  manifest/
  policy/
  runtime/
  sdk/
  cli/

adapters/
  rest/
  mcp/

connectors/
  mock/

examples/
  restaurant/
```

The exact workspace split may evolve before stable v1, but dependency direction and Core safety semantics are governed by the Phase 0 architecture baseline.

## Security model

A discovered or authenticated Agent is not automatically authorized to perform business actions.

Mutations flow through:

```text
Action Request
→ schema validation
→ actor/principal/delegation
→ Policy
→ Approval when required
→ idempotency
→ Connector
→ Audit / Event / Transaction
```

Protocol and Distribution adapters cannot silently weaken risk, approval, permissions, policy, idempotency or audit requirements.

## Distribution

Brivya separates:

- **Protocol Adapters** — how capabilities are invoked at runtime
- **Distribution Adapters** — how Business Agents are packaged and published into external ecosystems

Publication always requires explicit authorization and never bypasses platform qualification or review.

## Extensions

Brivya Studio and code-first workflows share one declarative runtime contract.

Phase 1 extension baseline includes:

- Capability Pack
- Connector
- Distribution Adapter
- explicit permissions
- worker / remote execution boundaries
- controlled UI Blocks
- Registry Client

Hosted Marketplace and commercial control-plane features are separate from the open Core.

## License

Brivya Core is planned under **Apache-2.0**.

The Brivya name and brand are governed separately by trademark policy.

## Contributing

See `CONTRIBUTING.md`.

## Security

Please report vulnerabilities privately according to `SECURITY.md`. Do not open public issues for sensitive security reports.

## Mission

> Make every business agent-accessible.

Website: https://brivya.com
