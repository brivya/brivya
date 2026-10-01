# @brivya/adapter-rest

Framework-neutral REST projection over the canonical `BusinessRuntime`.

## Route

```text
POST /v0alpha1/capabilities/{capability}/execute
```

Protocol metadata is carried by headers:

- `X-Brivya-Capability-Version`
- `X-Request-Id`
- `X-Correlation-Id`
- `X-Causation-Id`
- `Idempotency-Key`

The body contains only business-controlled invocation data:

```json
{
  "input": {},
  "preconditions": {}
}
```

## Security boundary

The request body is **not** allowed to assert trusted identity or approval state.

The hosting HTTP layer must resolve authentication/session state and pass a trusted `RestSecurityContext` containing:

- actor
- principal
- delegation
- approval evidence

The adapter then constructs `ActionRequest` and calls the same `BusinessRuntime` used by every other protocol.

The REST adapter never:

- authorizes capabilities itself;
- bypasses Policy;
- fabricates Approval;
- calls Connector code directly;
- implements a second idempotency path.

## Error mapping

Runtime errors remain Brivya errors and are only projected to HTTP status codes.

Business safety semantics remain owned by Runtime.
