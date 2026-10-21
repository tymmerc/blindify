#!/usr/bin/env bash
# Tests de purge-connexions-spotify-2026-10-21.sh contre la base Jest jetable
# (jamais la prod) : sauvegarde en 600 avant la suppression, seules les lignes
# Spotify partent, comptes avant/apres, et un second passage ne fait rien.
#
# Usage, en local :
#   bash backend/scripts/test-db.sh up && bash scripts/purge-connexions-spotify-2026-10-21.test.sh

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/purge-connexions-spotify-2026-10-21.sh"
PG_CONTAINER="${PG_CONTAINER:-blindz-jest-postgres}"
PG_USER="${PG_USER:-blindz}"
PG_DB="${PG_DB:-blindz_test}"
ECHECS=0

if [ "$PG_CONTAINER" = "blindify-postgres" ]; then
  echo "REFUS : $PG_CONTAINER est la base de production" >&2
  exit 2
fi

ok() { echo "ok    $1"; }
ko() { echo "ECHEC $1"; ECHECS=$((ECHECS + 1)); }
psql_t() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -qAt "$@"; }
lance() {
  PG_CONTAINER="$PG_CONTAINER" PG_USER="$PG_USER" PG_DB="$PG_DB" BACKUP_DIR="$SAUVE" bash "$SCRIPT" "$@"
}

SAUVE="$(mktemp -d)"
trap 'rm -rf "$SAUVE"; psql_t -c "DELETE FROM users WHERE provider_id LIKE '"'"'t15-purge-%'"'"'" >/dev/null' EXIT

# Jeu d'essai : 4 connexions Spotify (comme en prod) et une Deezer qui doit rester.
# La base de test est jetable : on part d'une table vide (les tests Jest y
# laissent des connexions).
psql_t >/dev/null <<'SQL'
DELETE FROM user_connections;
DELETE FROM users WHERE provider_id LIKE 't15-purge-%';
WITH u AS (
  INSERT INTO users (provider, provider_id, username)
  SELECT 'spotify', 't15-purge-' || g, 'purge_' || g FROM generate_series(1, 5) g
  RETURNING id, provider_id
)
INSERT INTO user_connections (user_id, provider, access_token, refresh_token)
SELECT id,
       CASE WHEN provider_id = 't15-purge-5' THEN 'deezer' ELSE 'spotify' END,
       'jeton-acces-' || provider_id, 'jeton-refresh-' || provider_id
FROM u;
SQL

# 1. --compter : rien ne bouge.
sortie="$(lance --compter)"
grep -q "connexions spotify : 4" <<< "$sortie" && ok "--compter annonce 4 lignes" || ko "--compter : $sortie"
[ "$(psql_t -c "SELECT count(*) FROM user_connections WHERE provider = 'spotify'")" = "4" ] \
  && ok "--compter ne supprime rien" || ko "--compter a supprime"
[ -z "$(ls -A "$SAUVE")" ] && ok "--compter n'ecrit aucune sauvegarde" || ko "--compter a ecrit une sauvegarde"

# 2. Passage reel.
sortie="$(lance)"
grep -q "avant : 4" <<< "$sortie" && ok "compte avant affiche" || ko "compte avant : $sortie"
grep -q "apres : 0" <<< "$sortie" && ok "compte apres affiche" || ko "compte apres : $sortie"
[ "$(psql_t -c "SELECT count(*) FROM user_connections WHERE provider = 'spotify'")" = "0" ] \
  && ok "les 4 connexions Spotify sont supprimees" || ko "connexions Spotify restantes"
[ "$(psql_t -c "SELECT count(*) FROM user_connections uc JOIN users u ON u.id = uc.user_id WHERE u.provider_id = 't15-purge-5'")" = "1" ] \
  && ok "la connexion Deezer reste" || ko "la connexion Deezer a disparu"

fichier="$(ls "$SAUVE"/user_connections-spotify-*.csv 2>/dev/null | head -1)"
[ -n "$fichier" ] && ok "sauvegarde ecrite" || ko "aucune sauvegarde"
if [ -n "$fichier" ]; then
  [ "$(stat -c %a "$fichier")" = "600" ] && ok "sauvegarde en 600" || ko "droits $(stat -c %a "$fichier")"
  [ "$(($(wc -l < "$fichier") - 1))" = "4" ] && ok "4 lignes sauvegardees (plus l'entete)" || ko "$(wc -l < "$fichier") lignes"
  grep -q "jeton-refresh-t15-purge-1" "$fichier" && ok "la sauvegarde garde les jetons (restauration possible)" || ko "jetons absents"
fi
grep -q "jeton-" <<< "$sortie" && ko "un jeton est affiche" || ok "aucun jeton affiche"

# 3. Second passage : idempotent.
sortie="$(lance)"
grep -q "rien a faire" <<< "$sortie" && ok "second passage : rien a faire" || ko "second passage : $sortie"
[ "$(ls "$SAUVE" | wc -l)" = "1" ] && ok "second passage : pas de nouvelle sauvegarde" || ko "sauvegarde en trop"

# 4. Le retour arriere documente dans le script remet les 4 lignes.
if [ -n "$fichier" ]; then
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -q \
    -c "\copy user_connections FROM STDIN WITH CSV HEADER" < "$fichier"
  [ "$(psql_t -c "SELECT count(*) FROM user_connections WHERE provider = 'spotify'")" = "4" ] \
    && ok "retour arriere : les 4 lignes reviennent" || ko "retour arriere"
fi

# 5. Garde-fou : la prod par defaut seulement avec --prod.
if PG_CONTAINER= PG_USER= PG_DB= BACKUP_DIR="$SAUVE" bash "$SCRIPT" --compter >/dev/null 2>&1; then
  ko "la prod est visee sans --prod"
else
  ok "sans --prod ni conteneur, refus"
fi

echo
if [ "$ECHECS" -eq 0 ]; then echo "TOUT EST VERT"; else echo "$ECHECS ECHEC(S)"; exit 1; fi
