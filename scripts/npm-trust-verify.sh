#!/usr/bin/env bash
set -euo pipefail
if (( $# != 0 )); then
  echo 'Usage: npm-trust-verify.sh' >&2
  exit 2
fi
exec node "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/npm-trust.mjs" verify
