#!/usr/bin/env bash
# Re-runs the mechanism comparison printed in the README.
#
# It shallow-clones the public source of three memory systems at the commits the README
# names (measured 27 August 2026) and searches for the neuroscience mechanisms ZenBrain
# implements; with --latest it uses today's default branches instead. It also counts
# the declared runtime dependencies behind the table's last row. Before printing any result it runs a
# positive and a negative control, so you can see the instrument works before you
# trust its output: a term that must be everywhere ("memory") and a term that must be
# nowhere. If the controls look wrong, the result is meaningless — say so, don't
# report it.
#
# A dash in the output means: the term does not occur in that snapshot. It does not
# mean the system cannot do something comparable under a different name.
#
# Usage:  bash scripts/compare-mechanisms.sh            # the README's pinned snapshot
#         bash scripts/compare-mechanisms.sh --latest   # today's default branches
# Needs:  git, grep, node. No API keys, no npm install, no network beyond the clones.

set -uo pipefail

WORK="${TMPDIR:-/tmp}/zenbrain-mechanism-compare"
mkdir -p "$WORK"

LATEST=0
[ "${1:-}" = "--latest" ] && LATEST=1

# name|url|commit — the pins the README's table was measured at:
#   mem0        tags ts-v3.1.7 and v2.0.19 (npm mem0ai 3.1.7, PyPI mem0ai 2.0.19)
#   letta-code  tag v0.31.2 (npm @letta-ai/letta-code 0.31.2)
#   zep         last commit before 28 August 2026 (the repository has no release tags;
#               it holds examples and integrations for the hosted Zep Cloud)
REPOS=(
  "mem0|https://github.com/mem0ai/mem0.git|dc82354e143c2581d505d581a00286d6ef8c3605"
  "letta-code|https://github.com/letta-ai/letta-code.git|67107804cfac7a9f85b3b913e766c9626ca9284c"
  "zep|https://github.com/getzep/zep.git|7de18dfa14da532cb782a0a14ae329e9a28b23d9"
)

# Mechanisms as named in ZenBrain's source, as extended regular expressions.
TERMS=(
  "FSRS spaced repetition:FSRS"
  "Hebbian learning:[Hh]ebbian"
  "Ebbinghaus forgetting curves:Ebbinghaus"
  "Sleep consolidation:sleep.consolidation"
  "Emotional tagging:emotional.(memory|tag)"
)

INCLUDES=(--include='*.py' --include='*.ts' --include='*.tsx' --include='*.js'
          --include='*.md' --include='*.go' --include='*.rs')

hits () {  # dir regex -> number of matching files, lockfiles excluded
  grep -rEli "$2" "$1" "${INCLUDES[@]}" 2>/dev/null \
    | grep -viE 'lock|node_modules|\.min\.' | wc -l | tr -d ' '
}

echo "Cloning public sources into $WORK (shallow, blobless; $([ $LATEST -eq 1 ] && echo 'default branches' || echo 'pinned commits'))…"
DIRS=()
for entry in "${REPOS[@]}"; do
  IFS='|' read -r name url sha <<< "$entry"
  if [ $LATEST -eq 1 ]; then
    dir="$WORK/$name-latest"
    rm -rf "$dir"
    git clone -q --depth 1 --filter=blob:none "$url" "$dir"
  else
    dir="$WORK/$name-$sha"
    if [ ! -d "$dir" ]; then
      git init -q "$dir"
      git -C "$dir" fetch -q --depth 1 --filter=blob:none "$url" "$sha"
      git -C "$dir" checkout -q FETCH_HEAD
    fi
  fi
  rev="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo '?')"
  printf '  %-12s %s\n' "$name" "$rev"
  DIRS+=("$dir")
done

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIRS=("$SELF/packages" "${DIRS[@]}")
NAMES=("ZenBrain" "Mem0" "Letta" "Zep")

echo
echo "Controls — the instrument must pass both before any result below counts."
printf '  %-32s' "positive: [Mm]emory (expect > 0)"
ok_pos=1
for d in "${DIRS[@]}"; do n=$(hits "$d" "[Mm]emory"); printf '%8s' "$n"; [ "$n" -gt 0 ] || ok_pos=0; done
echo "   $([ $ok_pos -eq 1 ] && echo PASS || echo 'FAIL — do not trust the table')"
printf '  %-32s' "negative: zzqqxxnotexist (expect 0)"
ok_neg=1
for d in "${DIRS[@]}"; do n=$(hits "$d" "zzqqxxnotexist"); printf '%8s' "$n"; [ "$n" -eq 0 ] || ok_neg=0; done
echo "   $([ $ok_neg -eq 1 ] && echo PASS || echo 'FAIL — do not trust the table')"

echo
printf '%-32s' "Mechanism"; for n in "${NAMES[@]}"; do printf '%8s' "$n"; done; echo
printf '%-32s' "--------------------------------"; for _ in "${NAMES[@]}"; do printf '%8s' "-------"; done; echo
for entry in "${TERMS[@]}"; do
  label="${entry%%:*}"; rx="${entry#*:}"
  printf '%-32s' "$label"
  for d in "${DIRS[@]}"; do
    n=$(hits "$d" "$rx"); [ "$n" -eq 0 ] && printf '%8s' "-" || printf '%8s' "$n"
  done
  echo
done

deps () {  # package.json -> number of declared runtime dependencies
  node -e 'const p=require(process.argv[1]); console.log(Object.keys(p.dependencies||{}).length)' "$1" 2>/dev/null || echo '?'
}
printf '%-32s%8s%8s%8s%8s\n' "Declared runtime dependencies" \
  "$(deps "$SELF/packages/core/package.json")" \
  "$(deps "${DIRS[1]}/mem0-ts/package.json")" \
  "$(deps "${DIRS[2]}/package.json")" "n/a"

echo
echo "Numbers are matching files, not occurrences. Dependencies: @zensation/core declares"
echo "one, @zensation/algorithms, which declares none; mem0ai is mem0-ts/package.json."
echo "getzep/zep holds examples and integrations for the hosted Zep Cloud; there is no"
echo "library to count, and a dash in its column covers that repository only."
if [ $LATEST -eq 1 ]; then
  echo "These are today's default branches, not the README's pinned snapshot."
fi
