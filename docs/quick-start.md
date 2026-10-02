# Quick Start — v0.1.0-alpha.1

> Brivya v0.1 is an alpha. Public APIs may change before v1.

## Requirements

- Node.js 20 or newer
- npm with workspace support

## Install from source

```bash
git clone https://github.com/brivya/brivya.git
cd brivya
npm install
npm run typecheck
npm test
```

## Create a Business Agent manifest

After the CLI package is available:

```bash
brivya init
brivya validate
brivya inspect
```

The default file is:

```text
business.agent.yaml
```

## Runtime model

Business mutations should always flow through the canonical Runtime:

```text
validate
→ authorize / delegation
→ policy
→ approval
→ idempotency
→ connector
→ transaction / audit
```

Do not call business databases directly from an LLM or platform adapter.

## Explore distribution targets

```bash
brivya target list
brivya target inspect workbuddy
brivya target inspect wechat-ai
brivya target validate wechat-ai
```

The alpha exposes inspection and validation only. Platform publication is intentionally not enabled as an unsafe shortcut.

## Restaurant reference

The restaurant example demonstrates:

```text
menu.search
availability.check
reservation.create
order.create
payment.request
```

REST and MCP both map to the same underlying Runtime semantics.

## Extension Host

The Extension baseline supports:

- explicit permissions
- install plans
- worker/remote execution boundaries
- opaque secret bindings
- Registry Client contracts

Permission requests are not grants. Effective permission is:

```text
requested ∩ tenant policy ∩ administrator grant
```

## Security reminders

- Agent identity does not grant business permission
- platform identity does not grant business permission
- UI confirmation does not replace approval
- extensions do not receive raw secret-store access
- distribution projections are derivative, not canonical truth
