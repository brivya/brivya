# Mock Connector

Deterministic reference connector used by Brivya contract and Restaurant E2E tests.

## Restaurant backend

`RestaurantMockConnector` provides in-memory deterministic state for:

- typed menu search
- reservation availability
- reservation creation
- versioned-price order creation
- provider-neutral payment authorization

It is intentionally a Connector implementation behind the canonical `BusinessRuntime`; it does not implement authorization, policy, approval, idempotency, transaction, or audit semantics itself.

Conflict behavior is deterministic:

- unavailable inventory → `CONFLICT / inventory_conflict`
- stale menu version or price snapshot → `CONFLICT / stale_price`
- invalid zoned reservation time → `INVALID_INPUT`

No external service or hidden cloud dependency is required.
