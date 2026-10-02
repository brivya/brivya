# Brivya

**Infrastructure for the Agentic Business Web.**

Brivya is open **Business-to-Agent Infrastructure** for turning real business capabilities into secure, typed and multi-platform Business Agents.

> **One Business Truth, Many Distribution Projections.**

Brivya helps a business define its capabilities once, run them through one governed runtime, and project them into multiple AI traffic and agent-host ecosystems.

## What Brivya does

Brivya sits between business systems and AI platforms:

```text
AI Traffic / Agent Host Platforms
WeChat AI / WorkBuddy / MCP Hosts / future platforms
                    │
                    ▼
           Distribution Profiles
 Discovery / Invocation / Identity / Experience
 Packaging / Validation / Publication
                    │
                    ▼
         Canonical Business Agent
 Manifest / Resources / Capabilities / Events
 Policy / Approval / SemanticExperience
                    │
                    ▼
             BusinessRuntime
 Validate → Authorize → Policy → Approval
 → Idempotency → Connector → Transaction/Audit
                    │
                    ▼
             Business Systems
 ERP / CRM / POS / MES / WMS / Payment / APIs
```

## Core principles

- **Business-first** — model real business capabilities, not prompt-only workflows.
- **One Business Truth** — business semantics are defined once.
- **Secure Runtime** — mutations pass authorization, policy, approval, idempotency and audit gates.
- **Protocol-neutral** — MCP, REST and future protocols are projections, not business truth.
- **Platform-neutral Core** — platform SDKs and card schemas stay outside Core.
- **Platform-native Experience** — SemanticExperience is rendered into host-native UI/cards.
- **Human-in-control** — high-risk actions remain explicitly governable.
- **Open Core** — core contracts and developer tooling remain open.

## Current status

Brivya is currently in **v0.1.0-alpha.1 Release Readiness**.

Phase 1 implementation milestones completed:

- ✅ Public monorepo bootstrap
- ✅ Core types + Business Agent Manifest
- ✅ Runtime + Policy + Approval
- ✅ REST + MCP adapters
- ✅ CLI + TypeScript SDK
- ✅ Restaurant Reference E2E
- ✅ DistributionProfile + SemanticExperience
- ✅ WorkBuddy + WeChat AI reference projections
- ✅ Extension Host baseline
- 🚧 v0.1.0-alpha.1 release readiness

Public APIs are still pre-stable and may change before v1.

## Packages

```text
packages/
  core/           Canonical business contracts
  manifest/       Business Agent Manifest parsing/validation
  policy/         Policy primitives
  runtime/        Governed BusinessRuntime
  experience/     SemanticExperience contracts
  distribution/   DistributionProfile + conformance
  extensions/     Extension Host / permissions / registry contracts
  sdk/            TypeScript SDK
  cli/            Developer CLI

adapters/
  rest/
  mcp/
  workbuddy/
  wechat-ai/

connectors/
  mock/

examples/
  restaurant/
```

## Runtime safety model

A discovered or authenticated Agent is **not** automatically authorized to act.

Mutation path:

```text
Action Request
→ schema validation
→ actor / principal / delegation
→ Policy
→ Approval when required
→ idempotency
→ Connector
→ Transaction / Audit / Event
```

Important invariants:

```text
Agent Identity != Authorization
Discovery != Authorization
Platform Identity != Authorization
UI Confirmation != ApprovalRecord
Generated Artifact != Canonical Truth
```

## Multi-platform distribution

Brivya separates two concerns:

### Protocol Adapters

How a capability call reaches Runtime.

Examples:

- REST
- MCP

### Distribution Profiles

How one canonical Business Agent becomes a native service inside an external platform ecosystem.

Profiles may define:

- discovery mapping
- invocation mapping
- identity context mapping
- native experience/card rendering
- packaging
- validation
- publication metadata
- compatibility/drift handling

Current references:

- **WorkBuddy** — Agent Host / capability ecosystem reference
- **WeChat AI** — traffic-platform + native experience reference

The reference adapters do not bypass platform qualification, review or publication requirements.

## SemanticExperience

Brivya uses platform-neutral interaction semantics:

```text
SemanticExperience
        ↓
Distribution Renderer
        ↓
Platform-native Card / Component / Widget
```

Business actions stay bound to canonical Capability IDs.

A UI confirmation can collect user intent, but it never replaces Runtime approval.

## Extension Host

The Phase 1 Extension Host baseline supports:

- Extension Manifest / Package
- explicit permission grants
- permission expansion detection
- mandatory re-approval on privilege expansion
- worker / remote execution boundaries
- permission-scoped Host API
- opaque secret bindings
- outbound network allowlists
- Registry Client / install-plan baseline

Core rule:

```text
requested permissions
∩ tenant policy
∩ administrator grant
= effective permissions
```

There is no raw secret-read Host API.

## CLI

Core developer flow:

```bash
brivya init
brivya validate
brivya inspect
brivya dev
```

Distribution inspection:

```bash
brivya target list
brivya target inspect <target>
brivya target validate <target>
```

Real platform publishing is intentionally not enabled as an unsafe shortcut; publication must use an explicit authorization workflow.

## Reference E2E

The Restaurant reference demonstrates:

```text
Discover
→ menu.search
→ availability.check
→ reservation.create
→ order.create
→ payment.request
```

REST and MCP exercise the same underlying capability/runtime semantics.

## Architecture

The public implementation follows frozen architecture contracts maintained separately from the public code repository.

Key architectural ideas:

- Canonical Business Agent
- BusinessRuntime
- DistributionProfile
- SemanticExperience
- Extension Host
- Connector boundary
- Policy / Approval / Audit

Platform-specific schemas remain derivative outputs, not Core authority.

## Open-source boundary

Open source includes the framework contracts and developer-facing implementation needed to build and self-host Business Agents.

Commercial/managed layers may include:

- managed runtime
- hosted identity / secrets
- managed connectors
- Studio
- managed multi-platform publication
- private registry / marketplace
- enterprise governance
- observability
- future network services

## Security

Please report vulnerabilities privately according to `SECURITY.md`.

Do not open public issues for sensitive security reports.

## Contributing

See `CONTRIBUTING.md`.

## License

Apache-2.0.

The Brivya name and brand are governed separately by trademark policy.

## Mission

> **Make every business agent-accessible.**

Website: https://brivya.com
