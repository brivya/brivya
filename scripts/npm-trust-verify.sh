#!/usr/bin/env bash
set -euo pipefail

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

for pkg in "${packages[@]}"; do
  echo "==> ${pkg}"
  npm trust list "${pkg}" --json
  echo
done
