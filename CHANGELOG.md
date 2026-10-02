# Changelog

All notable changes to Brivya are documented here.

## [0.1.0-alpha.1] - Unreleased

First public alpha baseline for Brivya Open Framework.

### Added

- Canonical Business Capability contracts and common types
- Business Agent Manifest parser and validation
- Governed BusinessRuntime with authorization, policy, approval, idempotency, transaction and audit primitives
- REST and MCP runtime adapters
- TypeScript SDK and CLI
- Deterministic Restaurant reference E2E
- DistributionProfile v0alpha2 and SemanticExperience v0alpha1
- WorkBuddy reference projection
- WeChat AI reference projection
- Extension Package, Permission Model, Host API and Registry Client baseline
- Worker/remote Extension execution boundary model
- Release package verification

### Security invariants

- Agent Identity is not Authorization
- Platform Identity is not Authorization
- Discovery is not Authorization
- UI Confirmation is not ApprovalRecord
- Distribution projections cannot weaken canonical risk/approval/permission/idempotency semantics
- Extensions cannot read raw secrets through the Host API
- Permission expansion requires re-approval

### Known alpha limitations

- APIs are not yet stable
- A2A/UCP are not part of the required alpha baseline
- Real platform publication APIs are not enabled
- WASM Extension runtime is deferred
- Hosted Registry/Marketplace are not included
- Python SDK is deferred until the TypeScript API stabilizes
