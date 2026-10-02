# @brivya/cli

Local developer CLI for Business Agent manifests.

## Commands

```bash
brivya init [path] [--force]
brivya validate [path]
brivya inspect [path]
brivya dev [path] [--watch]
```

The CLI delegates manifest parsing and validation to `@brivya/manifest`.
It does not implement its own authorization, policy, approval, idempotency,
connector, transaction, or audit semantics. Capability execution remains owned
by the canonical `BusinessRuntime`.

`dev` is intentionally local-first: it validates the current manifest,
prints the resolved developer configuration, and can watch the manifest for
changes. It does not create a hidden Brivya cloud dependency.
