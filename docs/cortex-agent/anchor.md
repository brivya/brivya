<!-- cortex-agent:anchor:v1 -->
This project is governed with Cortex Agent v1.14.x.

## Project

- Public repository: `brivya/brivya`
- Private governance repository: `brivya/brivya-agent`
- Local governance path: `./.agent/`

## Governance model

This Public repository intentionally ignores `.agent/`.

A development checkout should mount/clone the private governance repository at:

```text
./.agent
```

Expected relationship:

```text
brivya/brivya        PUBLIC implementation
brivya/brivya-agent  PRIVATE Cortex governance
```

Read `./AGENTS.md` first.

If `.agent/` is present, load the current Mission, rules, references, decisions and waitpoints before making governed changes.

Cortex Decision is development governance and never substitutes for Brivya production authorization or customer transaction approval.
<!-- cortex-agent:anchor:end -->
