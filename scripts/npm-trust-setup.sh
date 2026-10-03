#!/usr/bin/env bash
set -euo pipefail

# Default to a read-only plan. Applying creates persistent package permissions.
case "${1:---check}" in
  --check|--dry-run) mode=check ;;
  --apply) mode=apply ;;
  *) echo 'Usage: npm-trust-setup.sh [--check|--dry-run|--apply]' >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  echo 'Expected only one mode flag.' >&2
  exit 2
fi
exec node "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/npm-trust.mjs" "$mode"
