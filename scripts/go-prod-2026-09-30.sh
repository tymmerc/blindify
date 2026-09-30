#!/bin/bash
# Deploiement prepare le 30/09/2026. A lancer UNIQUEMENT apres GO explicite de Tym,
# et via heavy (build Docker + build Next) :
#
#   heavy bash /opt/blindify/scripts/go-prod-2026-09-30.sh
#
# Contenu :
#   BACKEND  1. Verdict fin + devinette "qui a mis quoi" persistes (commit b1080a0)
#            2. Adresse de l'API Deezer surchargeable (DEEZER_API_BASE), neutre en
#               prod : sans la variable, c'est le vrai Deezer, comme avant
#   FRONTEND 3. Refonte des lobbys (commit ebae8ac) : ossature commune, Lancer
#               colle en bas sur telephone, titres par joueur, un seul Quitter
#            4. Solo : meme en-tete, plus d'etiquettes "Face A"
#
# La reconstruction du backend coupe les parties en cours quelques secondes.
# Retour arriere : les deux commandes affichees a l'etape 0.
set -euo pipefail
cd /opt/blindify
AVANT_IMAGE="$(docker images blindify-backend --format '{{.ID}}' | head -1)"
HORO="$(date +%Y%m%d-%H%M%S)"

echo "── 0. Sauvegardes ──"
docker exec blindify-postgres pg_dump -U blindify -d blindify | gzip > "/opt/backups/avant-deploy-$HORO.sql.gz"
docker tag blindify-backend:latest "blindify-backend:avant-$HORO"
cp -a frontend/out "/opt/backups/front-out-avant-$HORO"
echo "  base    : /opt/backups/avant-deploy-$HORO.sql.gz"
echo "  image   : blindify-backend:avant-$HORO ($AVANT_IMAGE)"
echo "  front   : /opt/backups/front-out-avant-$HORO"
echo "  retour backend : docker tag blindify-backend:avant-$HORO blindify-backend:latest && docker compose up -d --no-deps backend"
echo "  retour front   : rsync -a --delete /opt/backups/front-out-avant-$HORO/ /opt/blindify/frontend/out/"

echo "── 1. Backend ──"
# --no-deps : on ne recree NI postgres NI redis (une recreation a deja coupe la base).
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
# Le serveur de dev est arrete pendant le build : deux Next en memoire, c'est
# ce qui a contribue au gel du VPS le 30/09.
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
docker exec blindify-backend grep -q "source_correct" dist/services/gamePersistence.js && echo "  [ok] persistance du verdict et de la devinette embarquee" || echo "  !! persistance absente"
docker exec blindify-backend grep -q "DEEZER_API_BASE" dist/config/deezer.js && echo "  [ok] adresse Deezer configurable (non definie en prod)" || echo "  !! config/deezer absente"
docker exec blindify-backend printenv DEEZER_API_BASE >/dev/null 2>&1 && echo "  !! DEEZER_API_BASE est definie en prod : a retirer" || echo "  [ok] DEEZER_API_BASE non definie en prod"
grep -rqs "Salle d'attente" frontend/out/_next/static/chunks && echo "  [ok] nouveaux lobbys dans l'export" || echo "  !! nouveaux lobbys absents de l'export"
attend https://blindz.app/ "Le blind test avec" >/dev/null && echo "  [ok] landing servie" || { echo "  !! landing absente"; exit 1; }
attend https://blindz.app/jouer/ "Comment tu t" >/dev/null && echo "  [ok] wizard servi" || { echo "  !! wizard absent"; exit 1; }

echo "DEPLOIEMENT TERMINE. Verifications completes, une a la fois :"
echo "  cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "  cd /opt/blindify/tools && heavy node anticheat-e2e.mjs prod"
