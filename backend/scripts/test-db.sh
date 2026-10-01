#!/usr/bin/env bash
# Base Postgres jetable pour les tests d'integration du backend.
#
#   npm run test:db        demarre une base neuve et charge db/schema.sql
#   npm run test:db:down   l'arrete ; le conteneur et ses donnees disparaissent
#
# Conteneur blindz-jest-postgres sur 127.0.0.1:5437, donnees en memoire (tmpfs).
# Port volontairement different de 5432 (le Postgres de la prod sur le VPS) et
# de 5436 (la pile de test de la campagne de nuit) : tests/testDatabase.ts
# refuse 5432 de toute facon. La CI monte la meme base sur le meme port.
set -euo pipefail

NAME=blindz-jest-postgres
PORT=5437
IMAGE=postgres:15-alpine # meme version majeure que la prod
SCHEMA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/db/schema.sql"
URL="postgres://blindz:blindz@127.0.0.1:$PORT/blindz_test"

up() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --memory 384m --cpus 1 \
    --tmpfs /var/lib/postgresql/data:rw,size=256m \
    -e POSTGRES_USER=blindz -e POSTGRES_PASSWORD=blindz -e POSTGRES_DB=blindz_test \
    -p "127.0.0.1:$PORT:5432" "$IMAGE" >/dev/null

  # pg_isready repond deja pendant l'initialisation, puis le serveur redemarre :
  # on attend la fin de l'init dans le journal du conteneur (meme methode que
  # tools/test-stack/stack.sh).
  local ready=""
  for _ in $(seq 1 60); do
    if docker logs "$NAME" 2>&1 | grep -q "PostgreSQL init process complete" \
      && docker exec "$NAME" psql -U blindz -d blindz_test -qAt -c "SELECT 1" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  [ -n "$ready" ] || { echo "ECHEC : la base ne repond pas, voir : docker logs $NAME" >&2; exit 1; }

  docker exec -i "$NAME" psql -U blindz -d blindz_test -v ON_ERROR_STOP=1 -q <"$SCHEMA" >/dev/null
  local tables
  tables=$(docker exec "$NAME" psql -U blindz -d blindz_test -qAt \
    -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
  echo "Base de test prete ($tables tables) : $URL"
  echo "Lancer les tests : TEST_DATABASE_URL=$URL npm test"
}

case "${1:-up}" in
  up) up ;;
  down)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    echo "Base de test arretee."
    ;;
  *)
    echo "usage : $0 [up|down]" >&2
    exit 2
    ;;
esac
