#!/usr/bin/env bash
# Pile de test ISOLEE de Blindz. Rien ici ne touche la base de prod.
#
#   stack.sh up       base neuve + backend de test + proxy local
#   stack.sh down     arrete tout et jette la base (elle vit en memoire)
#   stack.sh status
#   stack.sh front    (re)construit le front de test depuis HEAD, a lancer via heavy
#
# Pourquoi : le backend de dev (:3097) ecrit dans la base de PROD. Une campagne
# de tests a l'echelle doit avoir sa propre base, son propre backend, et ne
# jamais sortir sur Internet (Deezer bloque l'IP du VPS pour tout le monde).
#
#   base      conteneur blindz-test-postgres, 127.0.0.1:5436, donnees en tmpfs,
#             memoire plafonnee ; schema copie de la prod (structure seule)
#   backend   le code du depot, 127.0.0.1:3098, garde-fou no-egress.cjs
#   proxy     127.0.0.1:3180 : front de test, API, websocket, extraits locaux
#   adresse   http://blindz-test.localhost:3180/blindify/ (Chrome resout
#             *.localhost en boucle locale ; il faut un nom a point pour que
#             le cookie de session soit accepte)
set -euo pipefail

ROOT=/opt/blindify
RUN="$ROOT/.test-stack"
HERE="$ROOT/tools/test-stack"
NODE=/root/.nvm/versions/node/v22.21.1/bin/node
PG=blindz-test-postgres
PGPORT=5436
BACKEND_PORT=3098
PROXY_PORT=3180
HOST=blindz-test.localhost
mkdir -p "$RUN/logs" "$RUN/run" "$RUN/audio"; touch "$RUN/logs/egress.log"

log() { echo "[stack] $*"; }
alive() { [ -f "$RUN/run/$1.pid" ] && kill -0 "$(cat "$RUN/run/$1.pid")" 2>/dev/null; }
wait_http() { # url, secondes
  for _ in $(seq 1 "$2"); do curl -sf -m 3 "$1" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

start_db() {
  if docker ps --format '{{.Names}}' | grep -qx "$PG"; then log "base deja lancee"; return; fi
  docker rm -f "$PG" >/dev/null 2>&1 || true
  docker run -d --name "$PG" --memory 384m --cpus 1 \
    --tmpfs /var/lib/postgresql/data:rw,size=512m \
    -e POSTGRES_USER=blindify -e POSTGRES_PASSWORD=test -e POSTGRES_DB=blindify_test \
    -p "127.0.0.1:$PGPORT:5432" postgres:15-alpine >/dev/null
  # pg_isready repond deja pendant l'initialisation, puis le serveur redemarre :
  # on attend la fin de l'init dans le journal du conteneur.
  for _ in $(seq 1 60); do
    docker logs "$PG" 2>&1 | grep -q "PostgreSQL init process complete" \
      && docker exec "$PG" psql -U blindify -d blindify_test -qAt -c "SELECT 1" >/dev/null 2>&1 && break
    sleep 1
  done
  # Structure seule de la prod (aucune donnee), pour tester ce qui tourne vraiment.
  docker exec blindify-postgres pg_dump -U blindify --schema-only --no-owner --no-privileges blindify \
    | docker exec -i "$PG" psql -q -U blindify -d blindify_test >"$RUN/logs/schema.log" 2>&1 || true
  local n; n=$(docker exec "$PG" psql -U blindify -d blindify_test -qAt -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
  if [ "${n:-0}" -lt 10 ]; then log "ECHEC : schema non charge ($n tables), voir $RUN/logs/schema.log"; exit 1; fi
  log "base neuve : $n tables"
}

start_backend() {
  if alive backend; then log "backend deja lance"; return; fi
  local env="$RUN/run/backend.env"
  umask 077
  cat >"$env" <<EOF
NODE_ENV=production
LOG_LEVEL=info
PORT=$BACKEND_PORT
DATABASE_URL=postgres://blindify:test@127.0.0.1:$PGPORT/blindify_test
FRONTEND_URL=http://$HOST:$PROXY_PORT
PUBLIC_BACKEND_URL=http://$HOST:$PROXY_PORT/blindify
COOKIE_DOMAIN=$HOST
COOKIE_SECURE=false
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
E2E_BYPASS_KEY=$(cat "$ROOT/.e2e-bypass-key")
NO_EGRESS_LOG=$RUN/logs/egress.log
DEEZER_API_BASE=http://127.0.0.1:$PROXY_PORT/deezer-stub
EOF
  umask 022
  : >"$RUN/logs/egress.log"
  (
    cd "$ROOT/backend"
    set -a; . "$env"; set +a
    nohup "$NODE" -r "$HERE/no-egress.cjs" node_modules/ts-node/dist/bin.js --transpile-only src/index.ts \
      >"$RUN/logs/backend.log" 2>&1 &
    echo $! >"$RUN/run/backend.pid"
  )
  if wait_http "http://127.0.0.1:$BACKEND_PORT/api/health" 90; then log "backend de test pret (:$BACKEND_PORT)"
  else log "ECHEC backend, fin du journal :"; tail -20 "$RUN/logs/backend.log"; exit 1; fi
}

start_proxy() {
  if alive proxy; then log "proxy deja lance"; return; fi
  "$NODE" "$HERE/catalog.mjs" "$RUN/audio" >/dev/null
  FRONT_DIR="$RUN/front/frontend/out" AUDIO_DIR="$RUN/audio" PROXY_PORT=$PROXY_PORT BACKEND_PORT=$BACKEND_PORT \
    STUB_LOG="$RUN/logs/deezer-stub.log" PUBLIC_ORIGIN="http://$HOST:$PROXY_PORT" \
    nohup "$NODE" "$HERE/proxy.mjs" >"$RUN/logs/proxy.log" 2>&1 &
  echo $! >"$RUN/run/proxy.pid"
  wait_http "http://127.0.0.1:$PROXY_PORT/blindify/api/health" 20 && log "proxy pret : http://$HOST:$PROXY_PORT/blindify/"
}

stop() {
  for p in proxy backend; do
    if alive "$p"; then kill "$(cat "$RUN/run/$p.pid")" 2>/dev/null || true; fi
    rm -f "$RUN/run/$p.pid"
  done
  docker rm -f "$PG" >/dev/null 2>&1 || true
  log "pile arretee, base jetee"
}

build_front() {
  local head; head=$(git -C "$ROOT" rev-parse HEAD)
  if [ -f "$RUN/front.commit" ] && [ "$(cat "$RUN/front.commit")" = "$head" ] && [ -f "$RUN/front/frontend/out/index.html" ]; then
    log "front de test deja a jour ($head)"; return
  fi
  # Copie de travail separee : un build dans frontend/ ecraserait out/ (servi
  # tel quel par nginx) et le .next du serveur de dev.
  if [ -d "$RUN/front/.git" ] || [ -f "$RUN/front/.git" ]; then
    git -C "$RUN/front" checkout -q --detach "$head"
  else
    git -C "$ROOT" worktree add -q --detach "$RUN/front" "$head"
  fi
  ln -sfn "$ROOT/frontend/node_modules" "$RUN/front/frontend/node_modules"
  ln -sfn "$ROOT/frontend/.node" "$RUN/front/frontend/.node"
  (
    cd "$RUN/front/frontend"
    unset __NEXT_PRIVATE_STANDALONE_CONFIG
    NEXT_PUBLIC_API_URL="http://$HOST:$PROXY_PORT/blindify" NEXT_PUBLIC_BASE_PATH=/blindify \
      PATH="./.node/bin:$PATH" npx next build >"$RUN/logs/front-build.log" 2>&1
  ) || { log "ECHEC du build du front de test"; tail -30 "$RUN/logs/front-build.log"; exit 1; }
  echo "$head" >"$RUN/front.commit"
  log "front de test construit ($head)"
}

case "${1:-status}" in
  up) start_db; start_backend; start_proxy ;;
  down) stop ;;
  front) build_front ;;
  status)
    docker ps --format '{{.Names}} {{.Status}}' | grep "^$PG" || echo "base : arretee"
    for p in backend proxy; do alive "$p" && echo "$p : en marche (pid $(cat "$RUN/run/$p.pid"))" || echo "$p : arrete"; done
    echo "sorties refusees : $(wc -l <"$RUN/logs/egress.log" 2>/dev/null || echo 0)"
    ;;
  *) echo "usage : stack.sh up|down|status|front" >&2; exit 2 ;;
esac
