#!/bin/bash
# Mise en prod du 30/09/2026, FRONT SEUL, sur GO de Tym ("go en prod pour les lobbys").
#
#   heavy bash /opt/blindify/scripts/go-prod-2026-09-30-lobbys.sh
#
# Contenu (commit ebae8ac) :
#   - refonte des lobbys : ossature commune, Lancer colle en bas sur telephone,
#     titres amenes par chaque joueur, un seul bouton Quitter
#   - solo : meme en-tete que les salles, plus d'etiquettes "Face A"
# Le backend n'est PAS reconstruit (verdict fin et DEEZER_API_BASE attendent
# leur propre GO, voir go-prod-2026-09-30.sh).
#
# Le serveur de dev est arrete pendant le build (meme dossier .next, et deux
# Next en memoire ont contribue au gel du VPS le 30/09), puis relance.
set -euo pipefail
cd /opt/blindify
HORO="$(date +%Y%m%d-%H%M%S)"

echo "── 0. Sauvegarde de l'export actuel ──"
[ -z "$(git status --short frontend/)" ] || { echo "  !! frontend/ a des modifications non commitees : on ne deploie que du valide"; exit 1; }
cp -a frontend/out "/opt/backups/front-out-avant-$HORO"
echo "  export actuel : /opt/backups/front-out-avant-$HORO"
echo "  retour arriere : rsync -a --delete /opt/backups/front-out-avant-$HORO/ /opt/blindify/frontend/out/"

echo "── 1. Build de l'export statique (commit $(git rev-parse --short HEAD)) ──"
systemctl stop blindify-dev-frontend
relance_dev() { systemctl start blindify-dev-frontend; }
trap relance_dev EXIT
(
  cd frontend
  unset __NEXT_PRIVATE_STANDALONE_CONFIG NODE_ENV || true
  NEXT_PUBLIC_BASE_PATH="" \
  NEXT_PUBLIC_API_URL="https://blindz.app/api" \
  NEXT_PUBLIC_SOCKET_URL="https://blindz.app" \
  PATH="./.node/bin:$PATH" npx next build
)

echo "── 2. Verifications ──"
sleep 3
attend() {
  local url="$1" motif="$2" corps=""
  for _ in 1 2 3 4; do
    corps="$(curl -sf -m 30 "$url" || true)"
    printf '%s' "$corps" | grep -q "$motif" && return 0
    sleep 3
  done
  return 1
}
curl -sf -m 15 https://blindz.app/api/health >/dev/null && echo "  [ok] API en ligne" || { echo "  !! API muette"; exit 1; }
grep -rqs "Salle d'attente" frontend/out/_next/static/chunks && echo "  [ok] nouveaux lobbys dans l'export" || { echo "  !! nouveaux lobbys absents de l'export"; exit 1; }
# Seul l'ecran solo est vise : "Face A · Reponse" existe encore dans le dock de
# jeu (TheaterGameView), hors perimetre de ce deploiement.
grep -qs "Face A" frontend/out/_next/static/chunks/app/solo/*.js && echo "  !! etiquette Face A encore sur le solo" || echo "  [ok] plus d'etiquette Face A sur le solo"
attend https://blindz.app/ "Le blind test avec" && echo "  [ok] landing servie" || { echo "  !! landing absente"; exit 1; }
attend https://blindz.app/jouer/ "Comment tu t" && echo "  [ok] wizard servi" || { echo "  !! wizard absent"; exit 1; }
attend https://blindz.app/multiplayer/ "" && echo "  [ok] page des salles servie" || echo "  !! page des salles absente"
echo "MISE EN PROD DU FRONT TERMINEE ($HORO)."
