#!/usr/bin/env bash
# Verifies the zero-dependency claim the README makes, against the packed artifacts
# rather than against the source tree — a devDependency or a workspace link cannot
# hide from this.
#
#   @zensation/algorithms  must resolve to exactly 1 package (itself)
#   @zensation/core        must resolve to exactly 2 (itself + algorithms)
#
# Runs in CI on every push and pull request, so the claim cannot quietly stop being
# true between releases. Run it yourself: bash scripts/verify-zero-dependencies.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Packing the publishable artifacts…"
ALG_TGZ="$(cd "$ROOT/packages/algorithms" && npm pack --silent --pack-destination "$WORK")"
CORE_TGZ="$(cd "$ROOT/packages/core" && npm pack --silent --pack-destination "$WORK")"
echo "  $ALG_TGZ"
echo "  $CORE_TGZ"

count_tree () {  # name tarball... -> number of packages in the resolved tree
  local dir="$WORK/probe-$1"; shift
  mkdir -p "$dir"
  (cd "$dir" && npm init -y >/dev/null 2>&1 \
     && npm install --package-lock-only --ignore-scripts --silent "$@" >/dev/null 2>&1) \
    || { echo "npm could not resolve the tree for: $*" >&2; exit 1; }
  node -e "
    const lock = require('$dir/package-lock.json');
    const pkgs = Object.keys(lock.packages || {}).filter(k => k !== '');
    console.log(pkgs.length);
  "
}

fail=0

echo
echo "Resolving dependency trees from the packed tarballs…"
alg=$(count_tree algorithms "$WORK/$ALG_TGZ")
# core is resolved together with the algorithms tarball from this build, so a release
# that bumps both (core ^0.5.0 before 0.5.0 is on npm) checks the artifacts being
# published, not whatever the registry holds. A third package still means a new
# dependency; a range that misses the local algorithms makes the install fail.
core=$(count_tree core "$WORK/$ALG_TGZ" "$WORK/$CORE_TGZ")

printf '  %-26s %s package(s), expected 1  ' "@zensation/algorithms" "$alg"
if [ "$alg" -eq 1 ]; then echo "OK"; else echo "FAIL"; fail=1; fi

printf '  %-26s %s package(s), expected 2  ' "@zensation/core" "$core"
if [ "$core" -eq 2 ]; then echo "OK"; else echo "FAIL"; fail=1; fi

echo
if [ "$fail" -ne 0 ]; then
  echo "Zero-dependency claim BROKEN. Either fix the dependency or change the claim in"
  echo "README.md, the package descriptions and the elevator text — not just here."
  exit 1
fi

echo "Zero-dependency claim holds: the core chain pulls nothing but our own code."
