# Restaurant Reference

Reference Business Agent proving:

```text
Discover
→ typed Query
→ Reservation / Order
→ Policy / Approval / Idempotency
→ Transaction / Audit / Event
```

## Frozen v0alpha1 capabilities

- `menu.search`
- `availability.check`
- `reservation.create`
- `order.create`
- `payment.request`

The manifest bootstrap URL is:

```text
https://amina-coffee.agent.brivya.com
```

Discovery describes identity, protocols, capabilities and auth requirements. It never grants mutation authority.

## Validation

The deterministic reference suite implements the frozen Restaurant test matrix `RST-001..RST-024` from `brivya/company`.

Run from the monorepo root:

```bash
npm ci
npm run ci
```

REST and MCP exercise the same registered capability contracts through the same `BusinessRuntime`. The example has no provider-specific LLM or payment SDK dependency.
