# @brivya/sdk

TypeScript facade for supported Brivya public framework contracts.

The SDK exposes the canonical `@brivya/core`, `@brivya/manifest`,
`@brivya/policy`, and `@brivya/runtime` modules. It does not maintain a
second runtime truth or provider-specific LLM integration.

```ts
import {
  BusinessRuntime,
  loadBusinessAgentManifest,
  runtime,
} from "@brivya/sdk";
```

Use the canonical runtime classes for capability execution; SDK exports are
references to those same implementations.
