#!/usr/bin/env bash
# Re-runs the mechanism comparison printed in the README.
#
# It shallow-clones the public source of three memory systems and searches for the
# neuroscience mechanisms ZenBrain implements. Before printing any result it runs a
# positive and a negative control, so you can see the instrument works before you
# trust its output: a term that must be everywhere ("memory") and a term that must be
# nowhere. If the controls look wrong, the result is meaningless — say so, don't
# report it.
#
# A dash in the output means: the term does not occur in that snapshot. It does not
# mean the system cannot do something comparable under a different name.
#
# Usage:  bash scripts/compare-mechanisms.sh
# Needs:  git, grep. No API keys, no npm install, no network beyond the clones.

set -uo pipefail

WORK="${TMPDIR:-/tmp}/zenbrain-mechanism-compare"
mkdir -p "$WORK"

REPOS=(
  "mem0:https://github.com/mem0ai/mem0.git"
  "letta-code:https://github.com/letta-ai/letta-code.git"
  "zep:https://github.com/getzep/zep.git"
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

echo "Cloning public sources into $WORK (shallow, blobless)…"
for entry in "${REPOS[@]}"; do
  name="${entry%%:*}"; url="${entry#*:}"
  [ -d "$WORK/$name" ] || git clone -q --depth 1 --filter=blob:none "$url" "$WORK/$name"
  rev="$(git -C "$WORK/$name" rev-parse --short HEAD 2>/dev/null || echo '?')"
  printf '  %-12s %s\n' "$name" "$rev"
done

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIRS=("$SELF/packages" "$WORK/mem0" "$WORK/letta-code" "$WORK/zep")
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

echo
echo "Numbers are matching files, not occurrences. Snapshots are whatever the default"
echo "branches held when you ran this — re-run it rather than citing the README's date."
