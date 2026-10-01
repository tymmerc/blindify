#!/bin/bash
# Mise en prod groupee, preparee le 01/10/2026. A lancer UNIQUEMENT apres GO
# explicite de Tym, et via heavy (build Docker + build Next) :
#
#   heavy bash /opt/blindify/scripts/go-prod-2026-10-01.sh
#
# Remplace go-prod-2026-09-30.sh (jamais lance), dont il reprend le contenu.
#
# BACKEND (reconstruction de l'image, coupe les parties en cours quelques secondes)
#   1. Securite : le .env ne part plus dans l'image (.dockerignore). L'image de
#      prod actuelle contient /app/.env, secrets en clair dans une couche.
#   2. Securite : engine.io 6.6.11 et undici 7.30.0 (failles hautes corrigees,
#      npm audit --omit=dev : 2 -> 0).
#   3. Verdict fin + devinette "qui a mis quoi" persistes (b1080a0).
#   4. Adresse de l'API Deezer surchargeable (DEEZER_API_BASE), neutre en prod.
# FRONTEND (export statique)
#   5. Bulle chat + pierre-feuille-ciseaux v3, bas des colonnes alignes.
#   6. Solo : plus de debordement sur telephone.
#   7. Lien de defi construit depuis le site courant (plus tymmerc.eu en dur).
#   8. Construit en Node 22 (le front etait en Node 20, fin de maintenance).
#
# Retour arriere : les deux commandes affichees a l'etape 0.
set -euo pipefail
cd /opt/blindify
HORO="$(date +%Y%m%d-%H%M%S)"

echo "── 0. Garde-fous et sauvegardes ──"
if [ -n "$(git status --short backend/ frontend/ | grep -v '^??')" ]; then
  echo "  !! backend/ ou frontend/ a des modifications non commitees : on ne deploie que du commite"
  git status --short backend/ frontend/ | grep -v '^??'
  exit 1
fi
echo "  commit deploye : $(git rev-parse --short HEAD) ($(git branch --show-current))"
EN_COURS="$(docker exec blindify-postgres psql -U blindify -d blindify -qAt -c \
  "SELECT count(*) FROM multiplayer_rooms WHERE status = 'in_progress' AND started_at > now() - interval '30 minutes'")"
echo "  parties en cours (30 dernieres minutes) : $EN_COURS"
docker exec blindify-postgres pg_dump -U blindify -d blindify | gzip > "/opt/backups/avant-deploy-$HORO.sql.gz"
docker tag blindify-backend:latest "blindify-backend:avant-$HORO"
cp -a frontend/out "/opt/backups/front-out-avant-$HORO"
echo "  base    : /opt/backups/avant-deploy-$HORO.sql.gz"
echo "  image   : blindify-backend:avant-$HORO"
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

echo "── 2. Frontend (export statique, Node 22) ──"
# Le serveur de dev est arrete pendant le build : deux Next en memoire ont
# contribue au gel du VPS le 30/09.
systemctl stop blindify-dev-frontend
relance_dev() { systemctl start blindify-dev-frontend; }
trap relance_dev EXIT
(
  cd frontend
  unset __NEXT_PRIVATE_STANDALONE_CONFIG NODE_ENV || true
  NEXT_PUBLIC_BASE_PATH="" \
  NEXT_PUBLIC_API_URL="https://blindz.app/api" \
  NEXT_PUBLIC_SOCKET_URL="https://blindz.app" \
  PATH="/root/.nvm/versions/node/v22.21.1/bin:$PATH" npx next build
)

echo "── 3. Verifications ──"
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
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
verifie "API en ligne" "curl -sf -m 15 https://blindz.app/api/health >/dev/null"
verifie "plus de .env dans le conteneur" "! docker exec blindify-backend test -e /app/.env"
verifie "engine.io 6.6.11" "docker exec blindify-backend node -p \"require('/app/node_modules/engine.io/package.json').version\" | grep -qx 6.6.11"
verifie "undici 7.30.0" "docker exec blindify-backend node -p \"require('/app/node_modules/undici/package.json').version\" | grep -qx 7.30.0"
verifie "persistance du verdict et de la devinette" "docker exec blindify-backend grep -q source_correct dist/services/gamePersistence.js"
verifie "DEEZER_API_BASE non definie en prod" "! docker exec blindify-backend printenv DEEZER_API_BASE >/dev/null 2>&1"
verifie "bulle v3 dans l'export" "grep -rqs lobby-dock-onglet frontend/out/_next/static/chunks"
verifie "lien de defi sans tymmerc.eu" "! grep -rqs tymmerc.eu/blindify/challenge frontend/out/_next/static/chunks"
verifie "landing servie" "attend https://blindz.app/ 'Le blind test avec'"
verifie "wizard servi" "attend https://blindz.app/jouer/ 'Comment tu t'"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION A ECHOUE : voir ci-dessus, retour arriere possible (etape 0)"; exit 1; }

echo "DEPLOIEMENT TERMINE. Parcours complets ensuite, un a la fois :"
echo "  cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "  cd /opt/blindify/tools && heavy node party-4-joueurs.mjs prod"
echo "  cd /opt/blindify/tools && heavy node anticheat-e2e.mjs prod"
