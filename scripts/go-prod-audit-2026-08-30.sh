#!/bin/bash
# Deploiement prod du batch "audit fixes" du 30/08/2026.
# A lancer UNIQUEMENT apres GO explicite de Tym.
# Contenu : anti-triche (caviardage reponses), cycle de vie rooms, janitor DB,
# rate-limit socket, game:lost, streamer durci, index DB, node 22, rotation du
# mot de passe postgres, logs docker rotes, suppression container frontend,
# WebSocket nginx, gzip, cache statique, X-Frame-Options.
set -euo pipefail
cd /opt/blindify

echo "── 1. Rotation du mot de passe postgres ──"
# Auth locale (socket unix) en trust dans le container : les backups docker
# exec et l'introspection continuent de marcher apres rotation.
NEWPASS="$(openssl rand -hex 24)"
docker exec blindify-postgres psql -U blindify -d blindify -qc "ALTER USER blindify WITH PASSWORD '$NEWPASS'"
if grep -q '^DB_PASSWORD=' .env; then
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$NEWPASS|" .env
else
  printf 'DB_PASSWORD=%s\n' "$NEWPASS" >> .env
fi
chmod 600 .env
# ATTENTION : le backend DEV (systemd) se connecte au MEME postgres avec le
# meme user 'blindify'. Sans mise a jour de son DATABASE_URL + restart, il
# tombe en erreur d'auth au prochain reconnect. On propage et on redemarre.
DEV_ENV="/opt/blindify/.env.dev-backend"
if [ -f "$DEV_ENV" ]; then
  sed -i -E "s|(postgres://blindify:)[^@]*(@)|\1${NEWPASS}\2|" "$DEV_ENV"
  systemctl restart blindify-dev-backend
  echo "dev backend repointe sur le nouveau mot de passe et redemarre"
fi
echo "mot de passe tourne (present dans .env + .env.dev-backend, 600)"

echo "── 2. Backend : build node 22 + tous les fixes ──"
docker compose build backend

echo "── 3. Recreation du BACKEND uniquement (nouveau code + DATABASE_URL) ──"
# On ne recree QUE le backend : postgres et redis restent intouches (aucune
# coupure DB en prod). La cle logging ajoutee sur postgres/redis dans le compose
# reste latente et s'appliquera a leur prochaine recreation (maintenance dediee).
docker compose up -d backend
# Le container blindify-frontend (inutilise, nginx sert le statique en direct)
# devient orphelin puisqu'on l'a retire du compose : on le supprime a la main.
docker rm -f blindify-frontend 2>/dev/null && echo "container blindify-frontend inutile supprime" || true
echo "attente healthy..."
for i in $(seq 1 30); do
  st="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo starting)"
  [ "$st" = "healthy" ] && break
  sleep 2
done
docker inspect -f 'backend={{.State.Health.Status}}' blindify-backend
curl -sf https://blindz.app/api/health | head -c 100; echo

echo "── 4. Frontend : build statique prod ──"
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

echo "── 5. nginx prod : WebSocket + gzip + cache + X-Frame-Options ──"
python3 /opt/blindify/scripts/patch-nginx-audit-2026-08-30.py
nginx -t
systemctl reload nginx

echo "── 6. Verifications ──"
curl -sf -o /dev/null -w "front=%{http_code}\n" https://blindz.app/
curl -sf https://blindz.app/api/health | head -c 100; echo
curl -sfI https://blindz.app/ | grep -iE "x-frame-options|content-encoding" || true
echo "DEPLOIEMENT TERMINE. Lancer ensuite :"
echo "  cd /opt/blindify/tools && node anticheat-e2e.mjs prod && node soiree.mjs prod"
