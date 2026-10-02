# Migration Guidance — v0.1.0-alpha.1

This is the first public alpha, so there is no prior stable release to migrate from.

This document defines compatibility expectations for early adopters and future alpha upgrades.

## Stability level

The following are alpha contracts and may evolve:

- TypeScript APIs
- Business Agent Manifest fields
- Capability contracts
- DistributionProfile
- SemanticExperience
- Extension Host APIs

Breaking changes before v1 must include migration notes.

## Canonical boundaries to preserve

When adapting early prototypes to this alpha:

- keep business capability semantics in canonical contracts
- do not copy authorization logic into REST/MCP/platform adapters
- do not treat Agent identity as delegation
- move platform-specific UI/cards into Distribution renderers
- use SemanticExperience for platform-neutral interaction intent
- keep Extension privileges explicit and permission-scoped
- replace inline credentials with secret references/bindings

## Distribution migration

Older target-only integrations should converge toward:

```text
DistributionProfile
+ project target config
+ generated derivative artifacts
```

Do not make generated platform files the source of business truth.

## Extension migration

Third-party integration code should converge toward:

```text
Extension Manifest
→ Install Plan
→ explicit permission grant
→ worker/remote boundary
→ Host API
```

Direct raw secret reads and unrestricted network access are outside the supported model.

## Versioning

The first alpha version is:

```text
0.1.0-alpha.1
```

Future prereleases should use new immutable versions rather than replacing already published package bytes.
