# @brivya/cli

Local-first Brivya developer CLI.

```text
brivya init
brivya validate
brivya inspect
brivya dev
```

## init

Creates:

```text
business.agent.yaml
brivya.dev.json
.gitignore
```

The starter project contains no production credentials and requires no Brivya Cloud account.

## validate

Parses and validates the canonical Business Agent Manifest using `@brivya/manifest`.

Invalid contracts return a non-zero exit code.

## inspect

Shows:

- business identity;
- discovery posture;
- capability references;
- enabled protocol surfaces;
- auth/audit posture;
- connector binding state.

It intentionally reports only `credentialBound: true/false`; it does not print credential references or secret values.

## dev

Loads:

```text
business.agent.yaml
brivya.dev.json
```

and constructs the same `BusinessRuntime` exposed by `@brivya/runtime`.

The dev profile is a deterministic local fixture layer:

```json
{
  "schemaVersion": 1,
  "capabilities": [],
  "responses": {}
}
```

It is not a second authorization/runtime model. Any executed capability still flows through the canonical Runtime safety path.
