#!/usr/bin/env bash
# Pile de test ISOLEE de Blindz. Rien ici ne touche la base de prod.
#
#   stack.sh front    copie de travail du commit courant + build du front de test
#                     (tache lourde : via heavy). A refaire apres chaque commit.
#   stack.sh up       base neuve + backend de test + serveur local
#   stack.sh down     arrete tout et jette la base (elle vit en memoire)
#   stack.sh status
#
# Pourquoi : le backend de dev (:3097) ecrit dans la base de PROD. Une campagne
# de tests a l'echelle doit avoir sa propre base, son propre backend, et ne
# jamais sortir sur Internet (Deezer bloque l'IP du VPS pour tout le monde).
#
#   base      conteneur blindz-test-postgres, 127.0.0.1:5436, donnees en tmpfs,
#             memoire plafonnee ; schema copie de la prod (structure seule)
#   backend   le COMMIT courant (copie de travail .test-stack/front), :3098.
#             Jamais le dossier backend/ du depot : son .env vise la base de prod
#             (dotenv le lit dans le dossier courant) et il peut contenir un
#             fichier a moitie edite. Garde-fou no-egress.cjs : boucle locale
#             seulement, et seulement vers la base de test et le serveur local.
#   serveur   127.0.0.1:3180 : front de test, API, websocket, extraits, faux Deezer
#   adresse   http://blindz-test.localhost:3180/blindify/ (Chrome resout
#             *.localhost en boucle locale ; il faut un nom a point pour que
#             le cookie de session soit accepte)
set -euo pipefail

ROOT=/opt/blindify
RUN="$ROOT/.test-stack"
# Les outils tournent depuis l'endroit ou ils sont : le depot d'habitude, un
# worktree quand on teste une branche qui change la pile elle-meme (le serveur
# local, ce script). La copie de travail et la base restent celles de ROOT.
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
WT="$RUN/front"            # copie de travail du commit teste (front ET backend)
NODE=/root/.nvm/versions/node/v22.21.1/bin/node
PG=blindz-test-postgres
PGPORT=5436
BACKEND_PORT=3098
PROXY_PORT=3180
HOST=blindz-test.localhost
# L'Activite Discord est servie par le proxy de Discord, sur une AUTRE origine
# que l'API (https://<id>.discordsays.com en vrai). Sur la pile, le meme
# serveur local repond aussi sous ce nom : le SDK reecrit alors les adresses de
# l'API vers /.proxy/blindz comme en prod, sans se reecrire lui-meme.
DISCORD_HOST=discord-test.localhost
mkdir -p "$RUN/logs" "$RUN/run" "$RUN/audio"; touch "$RUN/logs/egress.log"

log() { echo "[stack] $*"; }
wait_http() { # url, secondes
  for _ in $(seq 1 "$2"); do curl -sf -m 3 "$1" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

# Un pid ne suffit pas (apres un arret brutal, il peut designer un autre
# processus) : on verifie aussi la ligne de commande.
mark_of() { [ "$1" = backend ] && echo "$HERE/no-egress.cjs" || echo "$HERE/proxy.mjs"; }
alive() {
  local f="$RUN/run/$1.pid" pid
  [ -f "$f" ] || return 1
  pid=$(cat "$f")
  kill -0 "$pid" 2>/dev/null && tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null | grep -qF "$(mark_of "$1")"
}
stop_pid() { # pid : TERM, 15 s de grace, puis KILL
  local pid=$1
  kill "$pid" 2>/dev/null || return 0
  for _ in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || return 0; sleep 1; done
  kill -9 "$pid" 2>/dev/null || true
}
port_busy() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }

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
  # Structure seule de la prod (aucune donnee, lecture seule cote prod).
  docker exec blindify-postgres pg_dump -U blindify --schema-only --no-owner --no-privileges blindify \
    | docker exec -i "$PG" psql -q -U blindify -d blindify_test >"$RUN/logs/schema.log" 2>&1 || true
  local n; n=$(docker exec "$PG" psql -U blindify -d blindify_test -qAt -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
  if [ "${n:-0}" -lt 10 ]; then log "ECHEC : schema non charge ($n tables), voir $RUN/logs/schema.log"; exit 1; fi
  log "base neuve : $n tables"
}

start_backend() {
  if alive backend; then log "backend deja lance"; return; fi
  if port_busy "$BACKEND_PORT"; then log "ECHEC : le port $BACKEND_PORT est deja pris par un autre processus"; exit 1; fi
  local be="$WT/backend"
  [ -f "$be/src/index.ts" ] || { log "ECHEC : pas de copie de travail, lancer d'abord : heavy $HERE/stack.sh front"; exit 1; }
  [ -e "$be/.env" ] && { log "ECHEC : un .env existe dans $be, il pourrait viser la prod"; exit 1; }
  ln -sfn "$(cat "$RUN/backend.deps" 2>/dev/null || echo "$ROOT/backend/node_modules")" "$be/node_modules"
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
NO_EGRESS_ALLOW_PORTS=$PGPORT,$PROXY_PORT,$BACKEND_PORT
DEEZER_API_BASE=http://127.0.0.1:$PROXY_PORT/deezer-stub
DISCORD_CLIENT_ID=100000000000000001
DISCORD_CLIENT_SECRET=secret-de-la-pile-de-test
DISCORD_API_BASE=http://127.0.0.1:$PROXY_PORT/discord-stub
ALLOWED_ORIGINS=http://$DISCORD_HOST:$PROXY_PORT
EOF
  printf 'X-E2E-Key: %s\nContent-Type: application/json\nOrigin: http://%s:%s\n' "$(cat "$ROOT/.e2e-bypass-key")" "$HOST" "$PROXY_PORT" >"$RUN/run/headers"
  umask 022
  : >"$RUN/logs/egress.log"
  git -C "$WT" rev-parse HEAD >"$RUN/run/backend.commit"
  (
    cd "$be"
    set -a; . "$env"; set +a
    # 9>&- : ne pas heriter du verrou de heavy (sinon un backend oublie le
    # garderait et bloquerait toutes les taches lourdes de la machine).
    nohup "$NODE" -r "$HERE/no-egress.cjs" node_modules/ts-node/dist/bin.js --transpile-only src/index.ts \
      >"$RUN/logs/backend.log" 2>&1 9>&- &
    echo $! >"$RUN/run/backend.pid"
  )
  if ! wait_http "http://127.0.0.1:$BACKEND_PORT/api/health" 90; then
    log "ECHEC backend, fin du journal :"; tail -20 "$RUN/logs/backend.log"; exit 1
  fi
  # Temoin : un invite cree par l'API doit apparaitre dans la base DE TEST.
  # Sinon le backend ecrit ailleurs, et on l'arrete avant tout le reste.
  local name="sonde-pile-$$"
  curl -sf -m 10 -X POST "http://127.0.0.1:$BACKEND_PORT/api/auth/guest" -H @"$RUN/run/headers" \
    -d "{\"nickname\":\"$name\"}" >/dev/null || true
  if [ "$(docker exec "$PG" psql -U blindify -d blindify_test -qAt -c "SELECT count(*) FROM users WHERE username='$name'")" != "1" ]; then
    log "ECHEC : le backend de test n'ecrit pas dans la base de test, arret immediat"
    stop_pid "$(cat "$RUN/run/backend.pid")"; rm -f "$RUN/run/backend.pid"
    exit 1
  fi
  log "backend de test pret (:$BACKEND_PORT, commit $(cut -c1-7 "$RUN/run/backend.commit"), temoin ecrit en base de test)"
}

start_proxy() {
  if alive proxy; then log "serveur local deja lance"; return; fi
  if port_busy "$PROXY_PORT"; then log "ECHEC : le port $PROXY_PORT est deja pris par un autre processus"; exit 1; fi
  "$NODE" "$HERE/catalog.mjs" "$RUN/audio" >/dev/null
  FRONT_DIR="$WT/frontend/out" AUDIO_DIR="$RUN/audio" PROXY_PORT=$PROXY_PORT BACKEND_PORT=$BACKEND_PORT \
    STUB_LOG="$RUN/logs/deezer-stub.log" PUBLIC_ORIGIN="http://$HOST:$PROXY_PORT" \
    nohup "$NODE" "$HERE/proxy.mjs" >"$RUN/logs/proxy.log" 2>&1 9>&- &
  echo $! >"$RUN/run/proxy.pid"
  wait_http "http://127.0.0.1:$PROXY_PORT/blindify/api/health" 20 && log "serveur local pret : http://$HOST:$PROXY_PORT/blindify/"
}

stop() {
  for p in proxy backend; do
    if alive "$p"; then stop_pid "$(cat "$RUN/run/$p.pid")"; fi
    rm -f "$RUN/run/$p.pid"
  done
  # Filet : processus de la pile sans pidfile (arret brutal, redemarrage du VPS).
  local pid
  for pid in $(pgrep -f -- "-r $HERE/no-egress.cjs" || true) $(pgrep -f -- "$NODE $HERE/proxy.mjs" || true); do
    [ "$pid" = "$$" ] || stop_pid "$pid"
  done
  docker rm -f "$PG" >/dev/null 2>&1 || true
  rm -f "$RUN/run/backend.env" "$RUN/run/headers" # contiennent la cle E2E
  log "pile arretee, base jetee"
}

# Dependances du commit teste. Par defaut, celles du depot (frontend/ et
# backend/ de /opt/blindify). STACK_DEPS=ci : celles du commit lui-meme,
# installees par npm ci dans un cache par lockfile (.test-stack/deps/<empreinte>),
# pour tester une PR qui change les dependances (Dependabot) AVANT de la fusionner.
deps_dir() { # commit, partie (frontend|backend) -> dossier node_modules a utiliser
  local head=$1 part=$2
  if [ "${STACK_DEPS:-}" != ci ]; then echo "$ROOT/$part/node_modules"; return; fi
  local key; key=$(git -C "$ROOT" show "$head:$part/package-lock.json" | sha256sum | cut -c1-16)
  local d="$RUN/deps/$part-$key"
  if [ ! -f "$d/.complet" ]; then
    log "npm ci de $part pour $(git -C "$ROOT" rev-parse --short "$head") (cache $part-$key)" >&2
    mkdir -p "$d"
    git -C "$ROOT" show "$head:$part/package.json" >"$d/package.json"
    git -C "$ROOT" show "$head:$part/package-lock.json" >"$d/package-lock.json"
    (cd "$d" && PATH="$(dirname "$NODE"):$PATH" npm ci --no-audit --no-fund >"$RUN/logs/npm-ci-$part.log" 2>&1) \
      || { log "ECHEC npm ci de $part, voir $RUN/logs/npm-ci-$part.log" >&2; return 1; }
    touch "$d/.complet"
  fi
  echo "$d/node_modules"
}

build_front() {
  # STACK_REF : branche, tag ou commit a tester (defaut : HEAD du depot).
  # Les branches des worktrees partagent les refs du depot.
  local head; head=$(git -C "$ROOT" rev-parse --verify "${STACK_REF:-HEAD}^{commit}")
  local front_deps back_deps
  front_deps=$(deps_dir "$head" frontend) || exit 1
  back_deps=$(deps_dir "$head" backend) || exit 1
  if [ -f "$RUN/front.commit" ] && [ "$(cat "$RUN/front.commit")" = "$head $front_deps" ] && [ -f "$WT/frontend/out/index.html" ]; then
    log "copie de travail et front de test deja a jour ($head)"; echo "$back_deps" >"$RUN/backend.deps"; return
  fi
  # Copie de travail separee : un build dans frontend/ ecraserait out/ (servi
  # tel quel par nginx) et le .next du serveur de dev.
  if [ -e "$WT/.git" ]; then
    git -C "$WT" checkout -q --detach "$head"
  else
    git -C "$ROOT" worktree add -q --detach "$WT" "$head"
  fi
  ln -sfn "$front_deps" "$WT/frontend/node_modules"
  ln -sfn "$ROOT/frontend/.node" "$WT/frontend/.node"
  ln -sfn "$back_deps" "$WT/backend/node_modules"
  echo "$back_deps" >"$RUN/backend.deps"
  (
    cd "$WT/frontend" || exit 1
    unset __NEXT_PRIVATE_STANDALONE_CONFIG
    NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="http://$HOST:$PROXY_PORT/blindify" NEXT_PUBLIC_BASE_PATH=/blindify \
      PATH="$(dirname "$NODE"):$PATH" npx next build >"$RUN/logs/front-build.log" 2>&1
  ) || { log "ECHEC du build du front de test"; tail -30 "$RUN/logs/front-build.log"; exit 1; }
  echo "$head $front_deps" >"$RUN/front.commit"
  log "copie de travail et front de test a jour ($head)"
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
