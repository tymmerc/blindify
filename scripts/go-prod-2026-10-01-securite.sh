#!/bin/bash
# Mise en prod des correctifs de securite du 01/10/2026 (PR #5, main cee54f7).
# GO de Tym : « pile de test puis prod ». A lancer via heavy, apres une
# campagne verte sur la pile isolee :
#
#   heavy bash /opt/blindify/scripts/go-prod-2026-10-01-securite.sh
#
# BACKEND (reconstruction de l'image, coupe les parties en cours quelques secondes)
#   - l'API et le socket n'acceptent plus que https://blindz.app ;
#   - identifiants Spotify/Deezer valides et encodes ; codes de salle et de
#     defi par crypto.randomInt ; spotify-preview-finder retire (plus d'undici).
# FRONTEND
#   - returnTo de la page de connexion limite aux chemins internes ;
#   - plus de /blindify en dur (lien de connexion, chemin du defi).
# EXPLORATEUR DE BASE (blindz-db-browser)
#   - identifiants echappes, erreurs generiques ; passe sous Node 22.
#
# Retour arriere : les commandes affichees a l'etape 0.
set -euo pipefail
cd /opt/blindify
HORO="$(date +%Y%m%d-%H%M%S)"
NODE22=/root/.nvm/versions/node/v22.21.1/bin

echo "── 0. Garde-fous et sauvegardes ──"
git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "  !! le dossier n'est pas sur origin/main : la prod se deploie depuis main"; exit 1
fi
if [ -n "$(git status --short backend/ frontend/ tools/ | grep -v '^??')" ]; then
  echo "  !! modifications non commitees dans backend/, frontend/ ou tools/"; exit 1
fi
echo "  commit deploye : $(git rev-parse --short HEAD) (main)"
EN_COURS="$(docker exec blindify-postgres psql -U blindify -d blindify -qAt -c \
  "SELECT count(*) FROM multiplayer_rooms WHERE status = 'in_progress' AND started_at > now() - interval '30 minutes'")"
echo "  parties en cours (30 dernieres minutes) : $EN_COURS"
docker exec blindify-postgres pg_dump -U blindify -d blindify | gzip > "/opt/backups/avant-deploy-$HORO.sql.gz"
docker tag blindify-backend:latest "blindify-backend:avant-$HORO"
cp -a frontend/out "/opt/backups/front-out-avant-$HORO"
cp -a /etc/systemd/system/blindz-db-browser.service "/opt/backups/blindz-db-browser.service-avant-$HORO"
echo "  base    : /opt/backups/avant-deploy-$HORO.sql.gz"
echo "  image   : blindify-backend:avant-$HORO (deja sans .env)"
echo "  front   : /opt/backups/front-out-avant-$HORO"
echo "  retour backend : docker tag blindify-backend:avant-$HORO blindify-backend:latest && docker compose up -d --no-deps backend"
echo "  retour front   : rsync -a --delete /opt/backups/front-out-avant-$HORO/ /opt/blindify/frontend/out/"
echo "  retour db-browser : cp /opt/backups/blindz-db-browser.service-avant-$HORO /etc/systemd/system/blindz-db-browser.service && systemctl daemon-reload && systemctl restart blindz-db-browser"

echo "── 1. Backend ──"
docker compose build backend
docker compose up -d --no-deps backend
for i in $(seq 1 30); do
  etat="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo inconnu)"
  [ "$etat" = "healthy" ] && { echo "  [ok] backend healthy apres ${i}0s"; break; }
  sleep 10
  [ "$i" = "30" ] && { echo "  !! backend jamais healthy, voir docker logs blindify-backend"; exit 1; }
done

echo "── 2. Frontend (export statique, Node 22) ──"
systemctl stop blindify-dev-frontend
relance_dev() { systemctl start blindify-dev-frontend; }
trap relance_dev EXIT
(
  cd frontend
  unset __NEXT_PRIVATE_STANDALONE_CONFIG NODE_ENV || true
  NEXT_PUBLIC_BASE_PATH="" \
  NEXT_PUBLIC_API_URL="https://blindz.app/api" \
  NEXT_PUBLIC_SOCKET_URL="https://blindz.app" \
  PATH="$NODE22:$PATH" npx next build
)

echo "── 3. Explorateur de base ──"
sed -i "s|^ExecStart=.*|ExecStart=$NODE22/node /opt/blindify/tools/db-browser.mjs|" /etc/systemd/system/blindz-db-browser.service
systemctl daemon-reload
systemctl restart blindz-db-browser

echo "── 4. Verifications ──"
sleep 3
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
code_post() { curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST https://blindz.app/api/__controle_origine -H 'Content-Type: application/json' -H "Origin: $1" -d '{}'; }
code_socket() { curl -s -o /dev/null -w '%{http_code}' -m 15 "https://blindz.app/socket.io/?EIO=4&transport=polling" -H "Origin: $1"; }
verifie "API en ligne" "curl -sf -m 15 https://blindz.app/api/health >/dev/null"
verifie "POST depuis blindz.app accepte (404 = route inconnue, origine admise)" "[ \"\$(code_post https://blindz.app)\" = 404 ]"
verifie "POST depuis une origine etrangere refuse (403)" "[ \"\$(code_post https://evil.example)\" = 403 ]"
verifie "POST depuis dev.tymmerc.eu refuse en prod (403)" "[ \"\$(code_post https://dev.tymmerc.eu)\" = 403 ]"
verifie "socket depuis blindz.app accepte (200)" "[ \"\$(code_socket https://blindz.app)\" = 200 ]"
verifie "socket depuis une origine etrangere refuse (403)" "[ \"\$(code_socket https://evil.example)\" = 403 ]"
verifie "plus de .env dans le conteneur" "! docker exec blindify-backend test -e /app/.env"
verifie "plus d'undici dans l'image" "! docker exec blindify-backend test -d /app/node_modules/undici"
verifie "engine.io 6.6.11" "docker exec blindify-backend node -p \"require('/app/node_modules/engine.io/package.json').version\" | grep -qx 6.6.11"
verifie "lien de connexion sans /blindify en dur" "! grep -rqs '/blindify/auth/login' frontend/out/_next/static/chunks"
verifie "chemin du defi sans /blindify en dur" "! grep -rqs '/blindify/challenge' frontend/out/_next/static/chunks"
verifie "landing servie" "curl -sf -m 30 https://blindz.app/ | grep -q 'Le blind test avec'"
verifie "explorateur de base actif sous Node 22" "systemctl is-active --quiet blindz-db-browser && ps -o args= -p \$(systemctl show -p MainPID --value blindz-db-browser) | grep -q v22"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION A ECHOUE : voir ci-dessus, retour arriere possible (etape 0)"; exit 1; }

echo "DEPLOIEMENT TERMINE. Parcours complets ensuite, un a la fois :"
echo "  cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "  cd /opt/blindify/tools && heavy node party-4-joueurs.mjs prod"
echo "  cd /opt/blindify/tools && heavy node anticheat-e2e.mjs prod"
