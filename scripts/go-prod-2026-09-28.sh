#!/bin/bash
# Deploiement du 28/09/2026. A lancer UNIQUEMENT apres GO explicite de Tym.
#
# Contenu :
#   BACKEND  1. CVE qs via Express (4.22.2 -> 4.22.3)
#            2. Caviardage des journaux (le jeton Spotify etait ecrit en clair)
#            3. Janitor : un invite qui a joue n'est plus efface a 30 jours
#   FRONTEND 4. Pseudo obligatoire, aucune identite creee a l'ouverture
#
# La reconstruction du backend coupe les parties en cours quelques secondes.
set -euo pipefail
cd /opt/blindify

AVANT_IMAGE="$(docker images blindify-backend --format '{{.ID}}' | head -1)"
HORO="$(date +%Y%m%d-%H%M%S)"
echo "── 0. Sauvegardes ──"
docker exec blindify-postgres pg_dump -U blindify -d blindify | gzip > "/opt/backups/avant-deploy-$HORO.sql.gz"
docker tag blindify-backend:latest "blindify-backend:avant-$HORO"
echo "  base    : /opt/backups/avant-deploy-$HORO.sql.gz"
echo "  image   : blindify-backend:avant-$HORO ($AVANT_IMAGE)"
echo "  retour  : docker tag blindify-backend:avant-$HORO blindify-backend:latest && docker compose up -d --no-deps backend"

echo "── 1. Backend ──"
# --no-deps : on ne recree NI postgres NI redis. Les recreer a deja provoque une
# coupure de quelques secondes sur la base lors d'un deploiement precedent.
docker compose build backend
docker compose up -d --no-deps backend

echo "  attente du healthcheck..."
for i in $(seq 1 30); do
  etat="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo inconnu)"
  [ "$etat" = "healthy" ] && { echo "  [ok] backend healthy apres ${i}0s"; break; }
  sleep 10
  [ "$i" = "30" ] && { echo "  !! backend jamais healthy, voir docker logs blindify-backend"; exit 1; }
done

echo "── 2. Frontend (export statique) ──"
systemctl stop blindify-dev-frontend
(
  cd frontend
  unset __NEXT_PRIVATE_STANDALONE_CONFIG NODE_ENV || true
  NEXT_PUBLIC_BASE_PATH="" \
  NEXT_PUBLIC_API_URL="https://blindz.app/api" \
  NEXT_PUBLIC_SOCKET_URL="https://blindz.app" \
  PATH="./.node/bin:$PATH" npx next build
)
systemctl start blindify-dev-frontend

echo "── 3. Verifications ──"
sleep 3
attend() {
  local url="$1" motif="$2" corps=""
  for _ in 1 2 3 4; do
    corps="$(curl -sf -m 30 "$url" || true)"
    printf '%s' "$corps" | grep -q "$motif" && { printf '%s' "$corps"; return 0; }
    sleep 3
  done
  printf '%s' "$corps"; return 1
}

curl -sf -m 15 https://blindz.app/api/health >/dev/null && echo "  [ok] API en ligne" || { echo "  !! API muette"; exit 1; }
V="$(docker exec blindify-backend node -e "console.log(require('express/package.json').version)")"
[ "$V" = "4.22.3" ] && echo "  [ok] express $V (CVE qs corrigee)" || echo "  !! express $V, attendu 4.22.3"
docker exec blindify-backend grep -q "caviardage()" dist/utils/logger.js && echo "  [ok] caviardage des journaux embarque" || echo "  !! caviardage absent"
docker exec blindify-backend grep -q "game_participants gp WHERE gp.user_id" dist/index.js && echo "  [ok] janitor protege les invites qui ont joue" || echo "  !! ancienne regle du janitor"

attend https://blindz.app/ "Le blind test avec" >/dev/null && echo "  [ok] landing servie" || { echo "  !! landing absente"; exit 1; }
attend https://blindz.app/jouer/ "Comment tu t" >/dev/null && echo "  [ok] wizard servi" || { echo "  !! wizard absent"; exit 1; }

echo "DEPLOIEMENT TERMINE. Verifications completes :"
echo "  cd frontend && node ../tools/soiree.mjs prod"
echo "  cd frontend && node ../tools/anticheat-e2e.mjs prod"
