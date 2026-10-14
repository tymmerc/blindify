#!/usr/bin/env bash
# Campagne sur une branche ou un commit precis (PR en cours, Dependabot...),
# sans changer la branche du depot (/opt/blindify sert aussi le site de dev).
#
#   campagne-ref.sh <ref> [options de campaign.mjs]
#   STACK_DEPS=ci campagne-ref.sh dependabot/npm_and_yarn/... --seed 3
#   campagne-ref.sh feat/x --script /chemin/test.mjs   (un script a soi au lieu de la campagne)
#
# Tout passe par heavy : la pile (ports 5436/3098/3180) n'appartient qu'a une
# tache a la fois sur la machine, et elle est demontee a la fin quoi qu'il arrive.
set -uo pipefail
ROOT=/opt/blindify
# Depuis l'endroit du script (depot ou worktree), comme stack.sh.
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
NODE=/root/.nvm/versions/node/v22.21.1/bin/node

if [ "${1:-}" != "--dedans" ]; then
  [ $# -ge 1 ] || { echo "usage : campagne-ref.sh REF [options de campaign.mjs | --script FICHIER [args]]" >&2; exit 2; }
  HEAVY_WAIT="${HEAVY_WAIT:-7200}" exec /usr/local/bin/heavy "$0" --dedans "$@"
fi
shift
REF=$1; shift

cd "$HERE"
trap './stack.sh down >/dev/null 2>&1 || true' EXIT
trap 'exit 130' INT TERM HUP
echo "=== $(date '+%F %T') campagne sur $REF ($(git -C "$ROOT" rev-parse --short "$REF^{commit}")), dependances : ${STACK_DEPS:-du depot}"
./stack.sh down >/dev/null 2>&1
STACK_REF="$REF" timeout 25m ./stack.sh front || { echo "ECHEC : build du front de test"; exit 1; }
timeout 5m ./stack.sh up || { echo "ECHEC : la pile n'a pas demarre"; exit 1; }
if [ "${1:-}" = "--script" ]; then
  shift
  timeout 45m "$NODE" "$@"
else
  timeout 45m "$NODE" campaign.mjs "$@"
fi
code=$?
echo "=== $(date '+%F %T') fin, code $code"
exit "$code"
