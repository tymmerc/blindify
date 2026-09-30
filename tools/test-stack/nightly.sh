#!/usr/bin/env bash
# Campagne de tests de nuit de Blindz, sans personne devant.
#
#   cron : 40 3 * * * /opt/blindify/tools/test-stack/nightly.sh
#
# 1. passe par heavy (une seule tache lourde a la fois sur le VPS ; si la
#    machine est occupee plus d'une heure, on abandonne et on previent)
# 2. reconstruit le front de test si le code a change depuis la derniere fois
# 3. monte la pile isolee, joue la campagne, alerte par e-mail si c'est rouge
# 4. demonte tout : rien ne reste tourner apres
set -uo pipefail
ROOT=/opt/blindify
HERE="$ROOT/tools/test-stack"
NODE=/root/.nvm/versions/node/v22.21.1/bin/node
LOG="$ROOT/.test-stack/logs/nightly.log"
mkdir -p "$(dirname "$LOG")"
export PATH="/usr/local/bin:/usr/bin:/bin"

if [ "${1:-}" != "--dedans" ]; then
  echo "=== $(date '+%F %T') demande de campagne" >>"$LOG"
  HEAVY_WAIT=3600 /usr/local/bin/heavy "$0" --dedans >>"$LOG" 2>&1
  code=$?
  if [ "$code" -eq 75 ]; then
    "$NODE" "$HERE/notify.mjs" "Campagne de nuit non lancee : machine occupee par une autre tache lourde, ou memoire insuffisante (voir le journal)." >>"$LOG" 2>&1
  elif [ "$code" -eq 137 ]; then
    "$NODE" "$HERE/notify.mjs" "Campagne de nuit tuee par le garde-fou memoire (plafond heavy depasse)." >>"$LOG" 2>&1
  fi
  exit "$code"
fi

cd "$HERE"
echo "=== $(date '+%F %T') campagne (commit $(git -C "$ROOT" rev-parse --short HEAD))"
# Une pile restee debout (arret brutal la veille) : on repart propre.
./stack.sh down >/dev/null 2>&1
# Delais maximum : une etape bloquee ne doit jamais garder le verrou de heavy
# (les autres chats attendraient une demi-heure puis abandonneraient).
if ! timeout 20m ./stack.sh front; then
  "$NODE" notify.mjs "Build du front de test en echec (voir .test-stack/logs/front-build.log)."
  exit 1
fi
if ! timeout 5m ./stack.sh up; then
  ./stack.sh down
  "$NODE" notify.mjs "La pile de test n'a pas demarre (voir .test-stack/logs/backend.log)."
  exit 1
fi
# CAMPAIGN_ARGS permet un essai court du lanceur (ex. "--no-browser").
# shellcheck disable=SC2086
timeout 45m "$NODE" campaign.mjs --alert ${CAMPAIGN_ARGS:-}
code=$?
[ "$code" -eq 124 ] && "$NODE" notify.mjs "Campagne de nuit interrompue apres 45 minutes (bloquee ?)."
./stack.sh down
echo "=== $(date '+%F %T') fin, code $code"
exit "$code"
