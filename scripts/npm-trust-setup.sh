#!/usr/bin/env bash
set -euo pipefail

required_npm_major=11
required_npm_minor=15

version="$(npm --version)"
major="${version%%.*}"
rest="${version#*.}"
minor="${rest%%.*}"

if (( major < required_npm_major || (major == required_npm_major && minor < required_npm_minor) )); then
  echo "npm >= 11.15.0 is required. Current: ${version}" >&2
  echo "Run: npm install -g npm@^11.15.0" >&2
  exit 1
fi

packages=(
  "@brivya/core"
  "@brivya/experience"
  "@brivya/manifest"
  "@brivya/policy"
  "@brivya/runtime"
  "@brivya/distribution"
  "@brivya/extensions"
  "@brivya/adapter-rest"
  "@brivya/adapter-mcp"
  "@brivya/adapter-workbuddy"
  "@brivya/adapter-wechat-ai"
  "@brivya/connector-mock"
  "@brivya/sdk"
  "@brivya/cli"
)

echo "Configuring npm Trusted Publishing for ${#packages[@]} packages."
echo "Repository: brivya/brivya"
echo "Workflow: release.yml"
echo "Permission: npm publish"
echo
echo "npm may require 2FA on the first trust command."
echo

for pkg in "${packages[@]}"; do
  echo "==> ${pkg}"
  npm trust github "${pkg}" --file release.yml --repo brivya/brivya --allow-publish --yes
  sleep 2
done

echo
echo "Trusted publishing configuration completed."
