#!/usr/bin/env bash
# Tests de tools/dev-db/dev-db.sh sur un conteneur JETABLE (autre nom, autre
# port, autre volume, secrets dans un dossier temporaire). Ne touche ni la
# prod, ni la vraie base de dev. Tout est supprime a la fin.
#
#   bash tools/dev-db/dev-db.test.sh
#
# Besoin de docker, openssl et du psql de l'hote (connexion par le port, comme
# le backend).
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/dev-db.sh"
TMP="$(mktemp -d)"
export DEV_PG_CONTAINER="blindz-dev-postgres-test-$$"
export DEV_PG_PORT="${DEV_DB_TEST_PORT:-5439}"
export DEV_PG_VOLUME="blindz-dev-pgdata-test-$$"
export DEV_DB_SECRETS="$TMP/secrets"
ECHECS=0

ok() { echo "ok    $1"; }
ko() { echo "ECHEC $1"; ECHECS=$((ECHECS + 1)); }
egal() { if [ "$1" = "$2" ]; then ok "$3"; else ko "$3 (attendu '$2', obtenu '$1')"; fi; }
super() { docker exec -i "$DEV_PG_CONTAINER" psql -X -qAt -U postgres -d "${1:-blindify_dev}"; }
tables() { echo "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | super; }

menage() {
  docker rm -f "$DEV_PG_CONTAINER" >/dev/null 2>&1
  docker volume rm "$DEV_PG_VOLUME" >/dev/null 2>&1
  rm -f "$TMP"/secrets/* "$TMP"/*.env "$TMP"/schema-casse.sql
  rmdir "$TMP/secrets" "$TMP" 2>/dev/null
}
trap menage EXIT

if ss -ltn | grep -q ":$DEV_PG_PORT "; then echo "REFUS : port $DEV_PG_PORT deja pris" >&2; exit 2; fi

# 1. Un schema qui casse au milieu ne laisse aucune table (M1), et le passage
#    suivant, avec le bon schema, le charge en entier.
ROOT="$(cd "$DIR/../.." && pwd)"
{ sed -n '1,/^CREATE TABLE public.imported_links/p' "$ROOT/backend/db/schema.sql" | sed '$d'
  echo "SELECT erreur_volontaire_du_test();"
  sed -n '/^CREATE TABLE public.imported_links/,$p' "$ROOT/backend/db/schema.sql"
} >"$TMP/schema-casse.sql"
DEV_DB_SCHEMA="$TMP/schema-casse.sql" bash "$SCRIPT" up >/dev/null 2>&1
egal "$(tables)" 0 "schema casse au milieu : aucune table ne reste"
bash "$SCRIPT" up >/dev/null || ko "up apres un echec"
egal "$(tables)" 26 "passage suivant : schema complet (26 tables)"

# 2. Idempotence.
sortie="$(bash "$SCRIPT" up)"
case "$sortie" in *"deja la"*"schema deja present (26 tables)"*) ok "second passage : rien a refaire" ;; *) ko "second passage : $sortie" ;; esac

# 3. Plafonds du conteneur : swap compris (M6), 127.0.0.1 seulement.
egal "$(docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}}' "$DEV_PG_CONTAINER")" "402653184 402653184" "memoire 384 Mo, sans swap en plus"
egal "$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}' "$DEV_PG_CONTAINER")" "127.0.0.1:$DEV_PG_PORT" "port lie a 127.0.0.1 seulement"
pass_super="$(cat "$DEV_DB_SECRETS/dev-db-superuser.pass")"
docker inspect "$DEV_PG_CONTAINER" | grep -qF "$pass_super" && ko "mot de passe superutilisateur visible dans docker inspect" || ok "mot de passe superutilisateur absent de docker inspect"

# 4. Le role : ses tables, sa base, rien d'autre.
egal "$(echo "SELECT string_agg(DISTINCT tableowner, ',') FROM pg_tables WHERE schemaname = 'public'" | super)" blindz_dev "tables possedees par le role"
egal "$(echo "SELECT rolsuper::text || rolcreatedb::text || rolcreaterole::text FROM pg_roles WHERE rolname = 'blindz_dev'" | super)" falsefalsefalse "role sans droits particuliers"
pass="$(cat "$DEV_DB_SECRETS/dev-db-role.pass")"
egal "$(PGPASSWORD="$pass" psql -X -qAt -h 127.0.0.1 -p "$DEV_PG_PORT" -U blindz_dev -d blindify_dev -c 'SELECT current_database()' 2>&1)" blindify_dev "connexion du role a sa base"
PGPASSWORD="$pass" psql -X -qAt -h 127.0.0.1 -p "$DEV_PG_PORT" -U blindz_dev -d postgres -c 'SELECT 1' >/dev/null 2>&1 \
  && ko "le role entre dans la base postgres" || ok "le role n'entre pas dans la base postgres"
PGPASSWORD=faux psql -X -qAt -h 127.0.0.1 -p "$DEV_PG_PORT" -U blindz_dev -d blindify_dev -c 'SELECT 1' >/dev/null 2>&1 \
  && ko "mauvais mot de passe accepte" || ok "mauvais mot de passe refuse depuis l'hote"
egal "$(stat -c '%a' "$DEV_DB_SECRETS" "$DEV_DB_SECRETS"/*.pass | sort -u | tr '\n' ' ')" "600 700 " "secrets en 600, dossier en 700"

# 5. Le fichier d'environnement : rien de l'ancien qui pointait la prod.
printf '%s\n' NODE_ENV=production PORT=3197 'DATABASE_URL=postgres://blindify:FAUX@127.0.0.1:5432/blindify' \
  'REDIS_URL=redis://:FAUX@127.0.0.1:6380' JWT_SECRET=FAUX SESSION_SECRET=FAUX COOKIE_DOMAIN=dev.tymmerc.eu >"$TMP/ancien.env"
bash "$SCRIPT" env "$TMP/ancien.env" "$TMP/nouveau.env" >/dev/null
egal "$(stat -c '%a' "$TMP/nouveau.env")" 600 "env en 600"
egal "$(grep -c FAUX "$TMP/nouveau.env")" 0 "aucune ancienne valeur reprise"
egal "$(grep -cE '^(NODE_ENV=development|COOKIE_DOMAIN=dev.tymmerc.eu)$' "$TMP/nouveau.env")" 2 "NODE_ENV=development, reglages du site gardes"
grep -q "@127.0.0.1:$DEV_PG_PORT/blindify_dev$" "$TMP/nouveau.env" && ok "DATABASE_URL vers blindify_dev" || ko "DATABASE_URL"
bash "$SCRIPT" env "$TMP/ancien.env" "$TMP/nouveau.env" >/dev/null 2>&1 && ko "env a ecrase un fichier existant" || ok "env refuse d'ecraser"

# 6. Noms reserves.
DEV_PG_PORT=5432 bash "$SCRIPT" up >/dev/null 2>&1; egal "$?" 2 "port 5432 refuse"
DEV_PG_DB=blindify bash "$SCRIPT" up >/dev/null 2>&1; egal "$?" 2 "base blindify refusee"
DEV_PG_CONTAINER=blindify-postgres bash "$SCRIPT" status >/dev/null 2>&1; egal "$?" 2 "conteneur de prod refuse"

echo
if [ "$ECHECS" -eq 0 ]; then echo "dev-db.sh : tout est vert"; else echo "dev-db.sh : $ECHECS echec(s)"; exit 1; fi
