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
- Workflow filename: the future OIDC release workflow
- GitHub-hosted runner
- `id-token: write`

The package `repository.url` metadata must exactly match:

```text
https://github.com/brivya/brivya
```

Trusted publishing should be preferred after the bootstrap publication because it uses short-lived OIDC credentials instead of long-lived npm write tokens.
