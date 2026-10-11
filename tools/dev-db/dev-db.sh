#!/usr/bin/env bash
# Base du backend de dev (dev.tymmerc.eu/blindify), separee de la prod (C0).
#
# Avant C0, le service blindify-dev-backend visait la base de PROD `blindify`
# et y appliquait du schema a chaque redemarrage. Ici : un conteneur Postgres a
# part (blindz-dev-postgres, 127.0.0.1:5438, volume persistant), une base
# blindify_dev et un role blindz_dev sans aucun droit ailleurs. Le Postgres de
# la prod n'est ni lu ni modifie par ce script.
#
#   bash tools/dev-db/dev-db.sh up                cree ou complete (idempotent)
#   bash tools/dev-db/dev-db.sh env SRC DEST      ecrit le .env du dev a partir
#                                                 de l'ancien, sans rien afficher
#   bash tools/dev-db/dev-db.sh comptes [API]     comptes de test via l'API du dev
#   bash tools/dev-db/dev-db.sh status            etat, sans aucun secret
#
# Secrets (mots de passe generes, jamais affiches) dans $DEV_DB_SECRETS, en 600.
# Toutes les valeurs se surchargent par l'environnement : c'est ce qui permet
# de rejouer le script sur un conteneur jetable (autre nom, autre port).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA="${DEV_DB_SCHEMA:-$ROOT/backend/db/schema.sql}"

CONTAINER="${DEV_PG_CONTAINER:-blindz-dev-postgres}"
PORT="${DEV_PG_PORT:-5438}"
VOLUME="${DEV_PG_VOLUME:-blindz-dev-pgdata}"
IMAGE="${DEV_PG_IMAGE:-postgres:15-alpine}" # meme version majeure que la prod
DB="${DEV_PG_DB:-blindify_dev}"
ROLE="${DEV_PG_ROLE:-blindz_dev}"
SECRETS="${DEV_DB_SECRETS:-/etc/blindz}"
SUPER_PASS_FILE="$SECRETS/dev-db-superuser.pass"
ROLE_PASS_FILE="$SECRETS/dev-db-role.pass"
COMPTES_FILE="$SECRETS/dev-comptes"

# Ports et noms reserves : ceux de la prod, de la pile de test, de jest.
case "$PORT" in 5432|5436|5437) echo "ECHEC : port $PORT reserve (prod, pile ou jest)" >&2; exit 2 ;; esac
case "$CONTAINER" in blindify-postgres|blindz-test-postgres|blindz-jest-postgres)
  echo "ECHEC : conteneur $CONTAINER reserve" >&2; exit 2 ;; esac
[ "$DB" != "blindify" ] || { echo "ECHEC : blindify est la base de prod" >&2; exit 2; }
[[ "$DB" =~ ^[a-z_][a-z0-9_]*$ && "$ROLE" =~ ^[a-z_][a-z0-9_]*$ ]] \
  || { echo "ECHEC : nom de base ou de role invalide" >&2; exit 2; }

log() { printf '[dev-db] %s\n' "$*"; }

# psql dans le conteneur, en superutilisateur, par le socket local (trust dans
# l'image officielle). Le SQL arrive sur l'entree standard : un mot de passe
# n'apparait jamais dans la liste des processus.
psql_super() { docker exec -i "$CONTAINER" psql -X -q -U postgres -d "${1:-postgres}" -v ON_ERROR_STOP=1 -At; }

secret_file() {
  local f="$1"
  if [ ! -s "$f" ]; then
    (umask 077; openssl rand -hex 24 >"$f")
    log "secret genere : $f (600)"
  fi
  chmod 600 "$f"
}

container_exists() { docker container inspect "$CONTAINER" >/dev/null 2>&1; }

wait_ready() {
  # Pendant l'initialisation, l'image lance un serveur temporaire qui n'ecoute
  # que sur le socket. Le TCP interne ne repond qu'au serveur definitif.
  for _ in $(seq 1 90); do
    if docker exec "$CONTAINER" pg_isready -q -h 127.0.0.1 -U postgres 2>/dev/null \
      && echo "SELECT 1" | psql_super >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ECHEC : la base ne repond pas, voir : docker logs $CONTAINER" >&2
  exit 1
}

up() {
  command -v openssl >/dev/null || { echo "ECHEC : openssl manquant" >&2; exit 1; }
  [ -f "$SCHEMA" ] || { echo "ECHEC : schema introuvable ($SCHEMA)" >&2; exit 1; }
  mkdir -p "$SECRETS"
  chmod 700 "$SECRETS"
  secret_file "$SUPER_PASS_FILE"
  secret_file "$ROLE_PASS_FILE"

  if container_exists; then
    log "conteneur $CONTAINER deja la"
    [ "$(docker container inspect -f '{{.State.Running}}' "$CONTAINER")" = true ] || docker start "$CONTAINER" >/dev/null
  else
    # POSTGRES_PASSWORD_FILE : le mot de passe ne figure ni dans `docker
    # inspect` ni dans la ligne de commande. 127.0.0.1 seulement.
    # --memory-swap egal a --memory : pas de swap en plus (celui du VPS est compte).
    docker run -d --name "$CONTAINER" --restart unless-stopped \
      --memory 384m --memory-swap 384m --cpus 1 \
      -v "$VOLUME:/var/lib/postgresql/data" \
      -v "$SUPER_PASS_FILE:/run/secrets/pg_super:ro" \
      -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD_FILE=/run/secrets/pg_super \
      -e POSTGRES_DB=postgres \
      -p "127.0.0.1:$PORT:5432" "$IMAGE" \
      -c shared_buffers=64MB -c max_connections=40 >/dev/null
    log "conteneur $CONTAINER cree (127.0.0.1:$PORT, volume $VOLUME)"
  fi
  wait_ready

  # Role applicatif : proprietaire de sa base, rien d'autre.
  local exists
  exists=$(echo "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'" | psql_super)
  if [ "$exists" != 1 ]; then
    echo "CREATE ROLE $ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 30" | psql_super
    log "role $ROLE cree"
  fi
  # Le mot de passe suit toujours le fichier (rejouable apres une rotation).
  printf "ALTER ROLE %s PASSWORD '%s';\n" "$ROLE" "$(cat "$ROLE_PASS_FILE")" | psql_super

  exists=$(echo "SELECT 1 FROM pg_database WHERE datname = '$DB'" | psql_super)
  if [ "$exists" != 1 ]; then
    echo "CREATE DATABASE $DB OWNER $ROLE ENCODING 'UTF8' TEMPLATE template0" | psql_super
    log "base $DB creee"
  fi
  # Personne d'autre que le role (et le superutilisateur) ne s'y connecte, et
  # le role ne se connecte pas aux autres bases du conteneur.
  psql_super <<SQL
REVOKE ALL ON DATABASE $DB FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE $DB TO $ROLE;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
SQL

  # Schema : la structure de la prod deja photographiee dans le depot
  # (tools/schema-snapshot.sh), chargee par le role pour qu'il possede ses
  # tables (le backend y cree index et colonnes au demarrage). Une seule fois.
  local tables
  tables=$(echo "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | psql_super "$DB")
  if [ "$tables" = 0 ]; then
    # -1 : une seule transaction. Un chargement casse au milieu ne laisse rien,
    # et le passage suivant recommence (sinon « schema deja present » a jamais).
    docker exec -i "$CONTAINER" psql -X -q -1 -U "$ROLE" -d "$DB" -v ON_ERROR_STOP=1 <"$SCHEMA" >/dev/null
    tables=$(echo "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | psql_super "$DB")
    log "schema charge depuis $(basename "$SCHEMA") : $tables tables"
  else
    log "schema deja present ($tables tables), non recharge"
  fi
  log "pret : base $DB, role $ROLE, 127.0.0.1:$PORT (mot de passe dans $ROLE_PASS_FILE)"
}

# Ecrit le fichier d'environnement du dev a partir de l'ancien. Garde les
# reglages du site (FRONTEND_URL, cookies, Spotify...), remplace la base, passe
# en NODE_ENV=development, tire un SESSION_SECRET propre au dev, et retire ce
# que le code n'utilise pas mais qui pointait la prod (JWT_SECRET, REDIS_URL).
# N'affiche que des noms de cles.
env_file() {
  local src="${1:?usage : env SRC DEST}" dest="${2:?usage : env SRC DEST}"
  [ -f "$src" ] || { echo "ECHEC : $src introuvable" >&2; exit 1; }
  [ -s "$ROLE_PASS_FILE" ] || { echo "ECHEC : lancer d'abord : $0 up" >&2; exit 1; }
  [ ! -e "$dest" ] || { echo "ECHEC : $dest existe deja, rien n'est ecrase" >&2; exit 1; }
  [ "$(readlink -f "$src")" != "$(readlink -f "$(dirname "$dest")")/$(basename "$dest")" ] \
    || { echo "ECHEC : SRC et DEST identiques" >&2; exit 1; }

  local tmp
  tmp="$(mktemp "$(dirname "$dest")/.dev-env.XXXXXX")"
  chmod 600 "$tmp"
  {
    echo "# Backend de dev, base separee de la prod (C0, ecrit par tools/dev-db/dev-db.sh)."
    grep -vE '^(NODE_ENV|DATABASE_URL|SESSION_SECRET|JWT_SECRET|REDIS_URL)=' "$src" | grep -vE '^# Backend de dev, base separee' || true
    echo "NODE_ENV=development"
    echo "DATABASE_URL=postgres://$ROLE:$(cat "$ROLE_PASS_FILE")@127.0.0.1:$PORT/$DB"
    echo "SESSION_SECRET=$(openssl rand -hex 32)"
  } >"$tmp"
  mv "$tmp" "$dest"
  log "ecrit : $dest (600). Cles : $(grep -oE '^[A-Z_]+=' "$dest" | tr -d = | tr '\n' ' ')"
  local removed
  removed=$(grep -oE '^(JWT_SECRET|REDIS_URL)=' "$src" | tr -d = | tr '\n' ' ' || true)
  [ -z "$removed" ] || log "retirees (inutilisees par le code, pointaient la prod) : $removed"
}

# Comptes de test, crees par l'API du dev (meme chemin que l'interface : le
# hachage reste celui du code). Idempotent : un pseudo deja note est saute.
comptes() {
  local api="${1:-http://127.0.0.1:3097}" origin="${DEV_ORIGIN:-https://dev.tymmerc.eu}"
  mkdir -p "$SECRETS"; chmod 700 "$SECRETS"
  [ -e "$COMPTES_FILE" ] || (umask 077; : >"$COMPTES_FILE")
  chmod 600 "$COMPTES_FILE"
  local name pass code
  for name in dev-hote dev-joueur-1 dev-joueur-2; do
    if grep -q "^$name " "$COMPTES_FILE"; then log "compte $name deja cree"; continue; fi
    pass="$(openssl rand -hex 12)"
    code=$(printf '{"username":"%s","password":"%s"}' "$name" "$pass" \
      | curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "$api/api/auth/register" \
          -H 'Content-Type: application/json' -H "Origin: $origin" --data-binary @-)
    case "$code" in
      200) echo "$name $pass" >>"$COMPTES_FILE"; log "compte $name cree" ;;
      409) log "compte $name deja en base mais absent de $COMPTES_FILE : a recreer a la main" ;;
      *) echo "ECHEC : creation de $name, HTTP $code" >&2; exit 1 ;;
    esac
  done
  log "identifiants dans $COMPTES_FILE (600)"
}

status() {
  if ! container_exists; then log "conteneur $CONTAINER absent"; exit 1; fi
  log "conteneur : $(docker container inspect -f '{{.State.Status}} (redemarrage {{.HostConfig.RestartPolicy.Name}})' "$CONTAINER")"
  echo "SELECT 'role ' || rolname || ' : superuser=' || rolsuper || ' createdb=' || rolcreatedb FROM pg_roles WHERE rolname = '$ROLE'" | psql_super | sed 's/^/[dev-db] /'
  log "tables : $(echo "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | psql_super "$DB")"
  log "migration 005 (user_audio_sources) : $(echo "SELECT to_regclass('public.user_audio_sources') IS NOT NULL" | psql_super "$DB")"
  log "migration 006 (discord) : $(echo "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'multiplayer_rooms' AND column_name = 'discord_instance_id')" | psql_super "$DB")"
  log "utilisateurs : $(echo "SELECT count(*) FROM users" | psql_super "$DB")"
}

case "${1:-}" in
  up) up ;;
  env) shift; env_file "$@" ;;
  comptes) shift; comptes "$@" ;;
  status) status ;;
  *) sed -n '2,17p' "$0" >&2; exit 2 ;;
esac
