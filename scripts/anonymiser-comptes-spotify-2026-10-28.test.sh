#!/usr/bin/env bash
# Tests de anonymiser-comptes-spotify-2026-10-28.sh contre la base Jest jetable
# (jamais la prod) : seuls les comptes Spotify perdent nom, e-mail, avatar et
# identifiant Spotify ; parties, stats et morceaux restent ; sauvegarde en 600 ;
# comptes avant/apres ; aucune donnee affichee ; un second passage ne fait rien.
#
# Usage, en local :
#   bash backend/scripts/test-db.sh up && bash scripts/anonymiser-comptes-spotify-2026-10-28.test.sh

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/anonymiser-comptes-spotify-2026-10-28.sh"
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
un() { psql_t -c "$1"; }

SAUVE="$(mktemp -d)"
nettoie() {
  rm -rf "$SAUVE"
  psql_t >/dev/null <<'SQL' || true
DELETE FROM room_participants WHERE room_id IN (SELECT id FROM multiplayer_rooms WHERE room_code = 'T15ANO');
DELETE FROM multiplayer_rooms WHERE room_code = 'T15ANO';
DELETE FROM user_stats WHERE user_id IN (SELECT id FROM users WHERE username LIKE 't15anon_%' OR provider_id LIKE 't15anon-%' OR (provider = 'spotify' AND provider_id LIKE 'anonyme-%'));
DELETE FROM users WHERE username LIKE 't15anon_%' OR provider_id LIKE 't15anon-%' OR (provider = 'spotify' AND provider_id LIKE 'anonyme-%');
SQL
}
trap nettoie EXIT

# Jeu d'essai : la base de test est jetable, on part sans aucun compte Spotify.
# 4 comptes Spotify (nom, e-mail, avatar comme en prod, l'un sans avatar), un
# compte invite qui ne doit pas bouger. Un des comptes Spotify a des stats et
# un pseudo de salle.
psql_t >/dev/null <<'SQL'
DELETE FROM users WHERE provider = 'spotify';
INSERT INTO users (provider, provider_id, username, email, avatar) VALUES
  ('spotify', 't15anon-sp1', 't15anon_Alice Martin', 'alice@exemple.test', 'https://i.scdn.co/image/a1'),
  ('spotify', 't15anon-sp2', 't15anon_Bob',          'bob@exemple.test',   'https://i.scdn.co/image/b2'),
  ('spotify', 't15anon-sp3', 't15anon_Chloe',        'chloe@exemple.test', 'https://i.scdn.co/image/c3'),
  ('spotify', 't15anon-sp4', 't15anon_Dan',          'dan@exemple.test',   NULL),
  ('guest',   't15anon-g1',  't15anon_Invite',       'invite@exemple.test', 'https://exemple.test/i.png');
INSERT INTO user_stats (user_id, total_games, total_correct, total_guesses)
  SELECT id, 7, 12, 30 FROM users WHERE provider_id = 't15anon-sp1';
SQL
ALICE="$(un "SELECT id FROM users WHERE provider_id = 't15anon-sp1'")"
psql_t >/dev/null <<SQL
WITH r AS (
  INSERT INTO multiplayer_rooms (room_code, host_user_id, status, max_players, question_count, mode)
  VALUES ('T15ANO', $ALICE, 'finished', 10, 10, 'friends') RETURNING id
)
INSERT INTO room_participants (room_id, user_id, nickname) SELECT id, $ALICE, 'Alice M.' FROM r;
SQL

# 1. --compter : rien ne bouge.
sortie="$(lance --compter)"
grep -q "comptes spotify a anonymiser : 4" <<< "$sortie" && ok "--compter annonce 4 comptes" || ko "--compter : $sortie"
[ "$(un "SELECT count(*) FROM users WHERE provider = 'spotify' AND email IS NOT NULL")" = "4" ] \
  && ok "--compter ne modifie rien" || ko "--compter a modifie"
[ -z "$(ls -A "$SAUVE")" ] && ok "--compter n'ecrit aucune sauvegarde" || ko "--compter a ecrit une sauvegarde"

# 2. Passage reel.
sortie="$(lance)"
grep -q "a anonymiser avant : 4" <<< "$sortie" && ok "compte avant affiche" || ko "compte avant : $sortie"
grep -q "a anonymiser apres : 0" <<< "$sortie" && ok "compte apres affiche" || ko "compte apres : $sortie"
[ "$(un "SELECT count(*) FROM users WHERE provider = 'spotify' AND (email IS NOT NULL OR avatar IS NOT NULL)")" = "0" ] \
  && ok "plus d'e-mail ni d'avatar" || ko "e-mail ou avatar restant"
[ "$(un "SELECT count(*) FROM users WHERE provider = 'spotify' AND username = 'Joueur anonyme'")" = "4" ] \
  && ok "pseudo neutre « Joueur anonyme »" || ko "pseudo"
[ "$(un "SELECT count(*) FROM users WHERE provider = 'spotify' AND provider_id = 'anonyme-' || id")" = "4" ] \
  && ok "identifiant Spotify remplace par anonyme-<id>" || ko "provider_id"
[ "$(un "SELECT count(*) FROM users WHERE provider_id LIKE 't15anon-sp%'")" = "0" ] \
  && ok "aucun ancien identifiant Spotify ne reste" || ko "ancien identifiant restant"
[ "$(un "SELECT id FROM users WHERE provider = 'spotify' AND provider_id = 'anonyme-$ALICE'")" = "$ALICE" ] \
  && ok "le compte garde son id (parties et morceaux restent rattaches)" || ko "id change"
[ "$(un "SELECT count(*) FROM room_participants WHERE user_id = $ALICE AND nickname IS NULL")" = "1" ] \
  && ok "le pseudo de salle est efface, la participation reste" || ko "pseudo de salle"
[ "$(un "SELECT total_games FROM user_stats WHERE user_id = $ALICE")" = "7" ] \
  && ok "les stats restent" || ko "stats perdues"
[ "$(un "SELECT username || '|' || email FROM users WHERE provider_id = 't15anon-g1'")" = "t15anon_Invite|invite@exemple.test" ] \
  && ok "le compte invite ne bouge pas" || ko "compte invite modifie"

fichier="$(ls "$SAUVE"/users-spotify-avant-anonymisation-*.csv 2>/dev/null | head -1)"
[ -n "$fichier" ] && ok "sauvegarde ecrite" || ko "aucune sauvegarde"
if [ -n "$fichier" ]; then
  [ "$(stat -c %a "$fichier")" = "600" ] && ok "sauvegarde en 600" || ko "droits $(stat -c %a "$fichier")"
  [ "$(($(wc -l < "$fichier") - 1))" = "4" ] && ok "4 comptes sauvegardes (plus l'entete)" || ko "$(wc -l < "$fichier") lignes"
  grep -q "alice@exemple.test" "$fichier" && ok "la sauvegarde garde ce qui est efface" || ko "sauvegarde incomplete"
fi
grep -q -E "exemple\.test|t15anon|scdn|Alice" <<< "$sortie" && ko "une donnee est affichee" || ok "aucune donnee affichee"

# 3. Second passage : idempotent.
sortie="$(lance)"
grep -q "rien a faire" <<< "$sortie" && ok "second passage : rien a faire" || ko "second passage : $sortie"
[ "$(ls "$SAUVE" | wc -l)" = "1" ] && ok "second passage : pas de nouvelle sauvegarde" || ko "sauvegarde en trop"

# 4. Garde-fou : la prod seulement avec --prod.
if PG_CONTAINER= PG_USER= PG_DB= BACKUP_DIR="$SAUVE" bash "$SCRIPT" --compter >/dev/null 2>&1; then
  ko "la prod est visee sans --prod"
else
  ok "sans --prod ni conteneur, refus"
fi

echo
if [ "$ECHECS" -eq 0 ]; then echo "TOUT EST VERT"; else echo "$ECHECS ECHEC(S)"; exit 1; fi
