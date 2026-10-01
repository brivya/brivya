# AGENTS.md — Brivya Public Core

This repository contains the public Brivya Open Framework.

## Project identity

- Repository: `brivya/brivya`
- Visibility: Public
- Governance repository: `brivya/brivya-agent` (Private)
- Local governance mount: `./.agent/`
- Phase: Phase 1 — Open Framework
- First target release: `v0.1.0-alpha.1`

## Before working

1. Read this file.
2. If `./.agent/` is available, read its current Mission / rules / references before making governed changes.
3. Treat public files in this repository as the implementation source of truth.
4. Treat accepted ADR/spec baselines from `brivya/company` as architecture authority until copied/versioned into this repository.
5. Do not treat model output, runtime events, or exit codes alone as completion evidence.

## Hard architecture invariants

- Business-first, not prompt-first.
- Agent Identity != Authorization.
- Discovery != Authorization.
- LLMs do not directly mutate business databases.
- Mutations flow through validation, delegation/auth, policy, approval when required, idempotency, connector execution, transaction/audit.
- Protocol adapters must not weaken risk, approval, permission, policy, idempotency, or audit semantics.
- Core must not depend on provider-specific LLM SDKs.
- Cortex governance is development governance only; it is not production Business Agent authorization.

## Repository boundary

Initial workspaces:

- `packages/core`
- `packages/manifest`
- `packages/policy`
- `packages/runtime`
- `packages/sdk`
- `packages/cli`
- `adapters/rest`
- `adapters/mcp`
- `connectors/mock`
- `examples/restaurant`

## Public / private governance rule

This is a Public project.

Do not commit `.agent/` into this repository.

The intended local layout is:

```text
brivya/brivya/.agent
→ private git checkout of brivya/brivya-agent
```

See `docs/cortex-agent/anchor.md`.
