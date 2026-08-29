#!/usr/bin/env bash
# Verifies that every publishable package actually ships what its `files` field
# promises — against the packed tarball, not the source tree.
#
# This exists because all six packages listed "LICENSE" in `files` for months
# while no package directory contained one. npm silently drops a `files` entry
# that matches nothing, so the declaration looked right and shipped nothing:
# four Apache-2.0 packages went to the registry without their licence text.
# A `files` entry is a claim; this is the check that makes it one we can keep.
#
# Run it yourself: bash scripts/verify-package-contents.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PACKAGES=(
  packages/algorithms
  packages/core
  packages/adapters/postgres
  packages/adapters/sqlite
  packages/mcp
  packages/ai-sdk
)

# Present in every published package, regardless of what else it ships.
REQUIRED=(LICENSE README.md package.json)

fail=0

for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('$ROOT/$pkg/package.json').name")
  tgz=$(cd "$ROOT/$pkg" && npm pack --silent --pack-destination "$WORK")
  listing=$(tar -tzf "$WORK/$tgz")

  printf '%-30s' "$name"
  missing=()
  for f in "${REQUIRED[@]}"; do
    grep -qx "package/$f" <<<"$listing" || missing+=("$f")
  done

  # Anything the package promises in `files` must resolve to at least one entry.
  while read -r entry; do
    [ -z "$entry" ] && continue
    grep -q "^package/$entry" <<<"$listing" || missing+=("files:$entry")
  done < <(node -p "(require('$ROOT/$pkg/package.json').files||[]).join('\n')")

  if [ "$pkg" = "packages/algorithms" ]; then
    algorithms_files=$(grep -vc '/$' <<<"$listing")
    algorithms_version=$(node -p "require('$ROOT/$pkg/package.json').version")
  fi

  if [ ${#missing[@]} -eq 0 ]; then
    echo "OK"
  else
    echo "MISSING: ${missing[*]}"
    fail=1
  fi
done

echo
if [ "$fail" -ne 0 ]; then
  echo "A package does not ship what its \`files\` field promises."
  echo "Either add the file to the package directory or drop the claim from \`files\`."
  exit 1
fi

echo "Every package ships its licence, its README and everything \`files\` claims."

# The README makes a reproducible-build claim with a number in it:
#   "the same 153-file `@zensation/algorithms@0.4.2` tarball published on npm"
# A count in a sentence is an invariant, not a counter — it goes false the next
# time we ship, and nothing notices. It already did: the claim sat at 152 files
# and 0.4.0 through two releases. This holds the sentence to the packed tarball.
claim=$(grep -oE '[0-9]+-file `@zensation/algorithms@[0-9]+\.[0-9]+\.[0-9]+`' "$ROOT/README.md" || true)

if [ -z "$claim" ]; then
  echo
  echo "README: the reproducible-build claim is gone or reworded."
  echo "Either restore it in the form '<N>-file \`@zensation/algorithms@<version>\`'"
  echo "or drop this check with it."
  exit 1
fi

claimed_files=${claim%%-file*}
claimed_version=${claim##*@}
claimed_version=${claimed_version%\`}

echo
if [ "$claimed_files" != "$algorithms_files" ] || [ "$claimed_version" != "$algorithms_version" ]; then
  echo "README claims a ${claimed_files}-file tarball for algorithms@${claimed_version}."
  echo "Packing packages/algorithms actually gives ${algorithms_files} files at ${algorithms_version}."
  echo "Update the sentence in README.md, or explain why the build stopped being reproducible."
  exit 1
fi

echo "README's ${claimed_files}-file claim for algorithms@${claimed_version} matches the packed tarball."
