#!/usr/bin/env bash
# Check that the canonical types in /shared/src/game.ts are reflected in
# both backend/src/types/game.ts and frontend/src/lib/types.ts.
#
# This is a coarse check: every type/interface name declared in shared must
# also appear in both mirrors. It does NOT enforce field-level equality
# (that would require running tsc on the shared package).
#
# Run from repo root: bash tools/check-shared-types.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED="$ROOT/shared/src/game.ts"
BACKEND="$ROOT/backend/src/types/game.ts"
FRONTEND="$ROOT/frontend/src/lib/types.ts"

if [[ ! -f "$SHARED" ]]; then
  echo "FAIL: shared types missing at $SHARED"
  exit 1
fi

# Extract exported type/interface names from shared.
NAMES=$(grep -E "^export (type|interface) [A-Z]" "$SHARED" | awk '{print $3}' | sed 's/[<{].*//')

if [[ -z "$NAMES" ]]; then
  echo "FAIL: no exported types found in $SHARED"
  exit 1
fi

MISSING=0
for name in $NAMES; do
  for target in "$BACKEND" "$FRONTEND"; do
    if ! grep -qE "(type|interface) $name\b" "$target"; then
      echo "FAIL: $name (declared in shared) is missing from $target"
      MISSING=$((MISSING+1))
    fi
  done
done

if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "Update the mirrors when changing shared/src/game.ts."
  exit 1
fi

echo "OK: all shared types are mirrored in backend and frontend ($(echo "$NAMES" | wc -w) types)"
