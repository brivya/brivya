# v0.1.0-alpha.1 Release Runbook

## Goal

Produce the first public Brivya alpha from a clean, reproducible and governed main branch.

## Preconditions

- MS-101 through MS-108 are passed
- MS-109 release-readiness checks are green
- all release PRs are merged
- main CI is green
- package versions are aligned at `0.1.0-alpha.1`
- `npm run release:verify` succeeds

## Verification

Run:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run release:verify
```

The release verification checks:

- public package version alignment
- compiled JavaScript entrypoints
- compiled TypeScript declaration entrypoints
- CLI binary
- internal @brivya dependency version pins
- private root/example boundaries

## Release contents

Public packages:

- @brivya/core
- @brivya/manifest
- @brivya/policy
- @brivya/runtime
- @brivya/experience
- @brivya/distribution
- @brivya/extensions
- @brivya/sdk
- @brivya/cli
- @brivya/adapter-rest
- @brivya/adapter-mcp
- @brivya/adapter-workbuddy
- @brivya/adapter-wechat-ai
- @brivya/connector-mock

Private/not published:

- root monorepo package
- @brivya/example-restaurant

## Publication order

Because public packages have internal dependencies, publish dependency-first:

1. @brivya/core
2. @brivya/experience
3. @brivya/manifest
4. @brivya/policy
5. @brivya/runtime
6. @brivya/distribution
7. @brivya/extensions
8. @brivya/adapter-rest
9. @brivya/adapter-mcp
10. @brivya/adapter-workbuddy
11. @brivya/adapter-wechat-ai
12. @brivya/connector-mock
13. @brivya/sdk
14. @brivya/cli

Use the npm prerelease dist-tag:

```text
next
```

Do not publish with `latest` for this alpha.

## GitHub release

After package publication is verified:

- create tag `v0.1.0-alpha.1`
- create GitHub prerelease
- use CHANGELOG.md as the release-note baseline
- include known alpha limitations
- link Quick Start and migration guidance

## Rollback / failure policy

If package publication fails partway:

- stop further publication
- do not overwrite already published immutable versions
- record exactly which packages were published
- fix forward with a new prerelease version if package contents must change
- do not republish different bytes under the same version

## Deployment proposal

`P1-D1-DEPLOYMENT-v1` remains separate unless explicitly approved.

This release runbook does not authorize production deployment or managed-cloud rollout.


## First-publication authentication

The first publication of a new `@brivya/*` package cannot rely exclusively on npm Trusted Publishing because npm requires the package to already exist before a trusted publisher can be configured.

Bootstrap flow:

1. Create a short-lived npm automation/granular token with permission to publish the `@brivya` scope.
2. Store it only as the GitHub Actions repository secret `NPM_TOKEN`.
3. Run `.github/workflows/release-bootstrap.yml` manually with:
   - `version=0.1.0-alpha.1`
   - `confirm=RELEASE`
4. Verify all 14 packages are published with dist-tag `next`.
5. Configure GitHub Actions as an npm Trusted Publisher for each published package.
6. Replace bootstrap-token publishing with OIDC trusted publishing for subsequent releases.
7. Revoke/delete the bootstrap `NPM_TOKEN` after the trusted publisher migration is verified.

Never commit npm credentials to the repository.

### Trusted Publishing target

For future releases configure npm Trusted Publisher with:

- GitHub organization: `brivya`
- Repository: `brivya`
- Workflow filename: `release.yml`
- GitHub-hosted runner
- `id-token: write`

The package `repository.url` metadata must exactly match:

```text
https://github.com/brivya/brivya
```

Trusted publishing should be preferred after the bootstrap publication because it uses short-lived OIDC credentials instead of long-lived npm write tokens.


### Subsequent releases

After all published packages are configured with npm Trusted Publisher:

- use `.github/workflows/release.yml`
- do not provide `NPM_TOKEN`
- GitHub Actions uses OIDC via `id-token: write`
- npm trusted publishing authenticates each `npm publish`
- provenance is generated automatically for public packages published from this public repository
- GitHub prerelease/tag creation remains part of the same workflow

## Trusted Publisher migration after alpha.1

After `v0.1.0-alpha.1` bootstrap publication succeeds, migrate all 14 public packages to npm Trusted Publishing.

Prerequisites:

- npm account 2FA enabled
- write permission for all `@brivya/*` packages
- npm CLI `>= 11.15.0`
- GitHub workflow `.github/workflows/release.yml` present on the default branch

Bulk configuration:

```bash
npm install -g npm@^11.15.0
npm login
bash scripts/npm-trust-setup.sh --check
# Review the entire plan and obtain approval for the persistent permissions.
bash scripts/npm-trust-setup.sh --apply
```

The setup script defaults to a read-only check (`--dry-run` is an alias for
`--check`). Only `--apply` creates missing bindings. Both modes inspect all 14
packages before any write. The target is:

```text
provider: GitHub Actions
repository: brivya/brivya
workflow: release.yml
allowed action: npm publish only
environment: none
```

An exact existing target is skipped. Any nonmatching publisher, extra permission,
or environment restriction stops the operation for owner review, including an
unrelated publisher alongside the expected target. Existing bindings are never
updated or revoked. This policy does not assume a particular npm limit on the
number of publishers.

Read/JSON/authentication failures are never treated as a missing binding. Apply
rechecks each missing package before creating it, verifies each write by reading
it back, and verifies all 14 again at the end. On the first write/read-back failure,
it stops further writes and reports created, skipped, failed, and unattempted
packages. A failed request may still have reached npm. Resolve the reported
problem and rerun `--check`, then `--apply`; no automatic retry or rollback occurs.
Created/skipped counts describe confirmed actions and can overlap failed results
if final verification detects drift. A successful check only validates a plan,
not the presence of bindings.

The shared Node helper parses the actual npm CLI 11.15 output: whitespace-separated
JSON objects with flattened `repository`/`file` fields and a `permissions` array;
`createPackage` grants direct publish. An empty successful list has no stdout.
Unknown or malformed output fails closed. See the upstream
[output implementation](https://github.com/npm/cli/blob/v11.15.0/lib/trust-cmd.js)
and [GitHub field mapping](https://github.com/npm/cli/blob/v11.15.0/lib/commands/trust/github.js).
Use a stable npm >= 11.15.0, a compatible Node version, account 2FA, and package
write access. Bypass-2FA granular tokens are not supported by `npm trust`. Commands
are pinned to `https://registry.npmjs.org/`; normal npm authentication, proxy and
CA configuration is preserved. Scripts do not install npm, log in, or save
credentials. Allow npm to complete its interactive 2FA flow. If it fails or times
out, resolve the error and recheck before applying again.

Hermetic tests (no npm account access or writes):

```bash
node --test scripts/npm-trust.test.mjs
```

Verify:

```bash
bash scripts/npm-trust-verify.sh
```

After verification:

1. run the OIDC `Release` workflow on a future prerelease;
2. confirm npm provenance is present;
3. remove the repository secret `NPM_TOKEN`;
4. revoke the bootstrap npm token.

Do not remove or revoke the bootstrap token until all 14 bindings are verified
and an explicitly approved OIDC release succeeds with provenance. Script PASS
verifies configuration only; it is not evidence of a successful OIDC publication.
Token removal/revocation and release execution require separate approval.
