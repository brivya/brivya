# @brivya/sdk

TypeScript developer facade over the public Brivya contracts.

The SDK deliberately does **not** define another Capability / Policy / Approval / Runtime model. It re-exports and delegates to the existing public packages:

```text
@brivya/core
@brivya/manifest
@brivya/policy
@brivya/runtime
```

## Manifest

```ts
import {
  loadManifest,
  validateManifest,
} from "@brivya/sdk";
```

## Local runtime

```ts
import {
  createLocalRuntime,
  FunctionConnectorExecutor,
} from "@brivya/sdk";

const { runtime, registry } = createLocalRuntime({
  capabilities,
  connector: new FunctionConnectorExecutor(async (ctx) => {
    // call your business system
  }),
});
```

The local runtime uses the same `BusinessRuntime` that REST/MCP use. There is no SDK-only authorization path.

## Action execution

```ts
const request = createActionRequest({
  capability: "order.create",
  capabilityVersion: "0.1.0",
  actor,
  principal,
  delegation,
  input,
  idempotencyKey: "request-123",
});

const result = await executeAction(
  runtime,
  request,
  approvals,
);
```

All Runtime safety semantics still apply:

- authorization/delegation;
- Policy;
- Approval;
- idempotency;
- Transaction;
- Audit/Event.
