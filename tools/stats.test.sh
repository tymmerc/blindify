#!/usr/bin/env bash
# Tests de tools/stats.sql (statistiques du tableau de bord prive) : on
# fabrique des comptes et des parties, vrais et de test, dans une base de test
# au schema de la prod, puis on verifie ce que le JSON compte et ce qu'il
# ecarte. Tout se passe dans une transaction annulee a la fin : la base de
# test ressort vide.
#
# Usage, en local (la base Jest, voir backend/scripts/test-db.sh) :
#   bash backend/scripts/test-db.sh up && bash tools/stats.test.sh
# La CI passe le conteneur de son service Postgres : PG_CONTAINER=<id>.
# Besoin de docker et de jq, rien d'autre.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SQL="${STATS_SQL:-$DIR/stats.sql}"
PG_CONTAINER="${PG_CONTAINER:-blindz-jest-postgres}"
PG_USER="${PG_USER:-blindz}"
PG_DB="${PG_DB:-blindz_test}"
ECHECS=0

# Jamais la base de prod, meme par erreur de variable.
if [ "$PG_CONTAINER" = "blindify-postgres" ]; then
  echo "REFUS : $PG_CONTAINER est la base de production" >&2
  exit 2
fi

ok() { echo "ok    $1"; }
ko() { echo "ECHEC $1"; ECHECS=$((ECHECS + 1)); }

# egal JSON FILTRE_JQ ATTENDU NOM
egal() {
  local obtenu
  obtenu="$(jq -c "$2" <<< "$1")"
  if [ "$obtenu" = "$3" ]; then ok "$4"; else ko "$4 (attendu $3, obtenu $obtenu)"; fi
}

# Le jeu d'essai. Les ids sont fixes pour que les attentes se lisent.
# 3339 fait partie des ids de test listes dans stats.sql (Guest-xxxxxx cree
# par game-start-check.mjs) : il doit etre ecarte, alors qu'un Guest-xxxxxx
# quelconque (id 6) est un vrai visiteur sans pseudo.
FIXTURES="$(cat <<'SQL'
INSERT INTO users (id, provider, provider_id, username, password_hash, created_at) VALUES
  (1,    'guest', 'p1',  'Alice',          NULL, '2026-10-01 10:00'),
  (2,    'local', 'p2',  'Bob',            'h',  '2026-10-01 11:00'),
  (3,    'guest', 'p3',  'Lea',            NULL, '2026-10-01 12:00'),
  (4,    'guest', 'p4',  'Tymeo',          NULL, '2026-10-01 12:00'),
  (5,    'guest', 'p5',  'e2e_robot',      NULL, '2026-10-02 09:00'),
  (6,    'guest', 'p6',  'Guest-abcdef',   NULL, '2026-10-02 09:00'),
  (7,    'local', 'p7',  'Tym',            'h',  '2026-10-02 09:00'),
  (8,    'guest', 'p8',  'sonde-pile-42',  NULL, '2026-10-02 09:00'),
  (9,    'guest', 'p9',  'Leah',           NULL, '2026-10-02 09:00'),
  (10,   'local', 'p10', 'audittest99',    'h',  '2026-10-02 09:00'),
  (3339, 'guest', 'p11', 'Guest-4fb71e',   NULL, '2026-10-02 09:00');

-- 101 vraie, 102 hebergee par un persona, 103 vraie hote mais un persona
-- joue, 104 sans hote enregistre, 105 hebergee par un id de la liste, 106
-- jamais lancee (absente du JSON).
INSERT INTO game_sessions (id, host_user_id, mode, state, started_at, ended_at, total_rounds) VALUES
  (101, 1,    'friends', 'finished',  '2026-10-01 20:00', '2026-10-01 20:20', 2),
  (102, 4,    'friends', 'finished',  '2026-10-01 21:00', '2026-10-01 21:10', 3),
  (103, 1,    'friends', 'abandoned', '2026-10-01 22:00', NULL,               1),
  (104, NULL, 'solo',    'finished',  '2026-10-02 10:00', '2026-10-02 10:05', 1),
  (105, 3339, 'friends', 'abandoned', '2026-10-02 11:00', NULL,               1),
  (106, 1,    'friends', 'waiting',   NULL,               NULL,               1);

INSERT INTO game_participants (session_id, user_id, score) VALUES
  (101, 1, 20), (101, 2, 0),
  (102, 4, 0), (102, 3, 0),
  (103, 1, 0), (103, 3, 0),
  (104, 6, 10),
  (105, 3339, 0);

-- "Titre A" joue deux fois en vraie partie (101) et une fois en test (102) ;
-- "Titre B" seulement en test : il ne doit pas apparaitre.
INSERT INTO game_rounds (id, session_id, round_index, correct_title, correct_artist) VALUES
  (1001, 101, 0, 'Titre A', 'Artiste A'),
  (1002, 101, 1, 'Titre A', 'Artiste A'),
  (1003, 102, 0, 'Titre A', 'Artiste A'),
  (1004, 102, 1, 'Titre B', 'Artiste B'),
  (1005, 102, 2, 'Titre B', 'Artiste B');

INSERT INTO round_responses (round_id, user_id, is_correct) VALUES
  (1001, 1, true), (1001, 2, false), (1002, 1, true),
  (1003, 3, false), (1003, 4, false), (1004, 3, false), (1005, 3, false);

INSERT INTO imported_links (user_id, url, normalized_url, provider, times_played) VALUES
  (1, 'u1', 'n1', 'spotify', 3),
  (3, 'u2', 'n2', 'spotify', 5),
  (5, 'u3', 'n3', NULL,      7);

INSERT INTO user_stats (user_id, total_games) VALUES (1, 5), (3, 50);
SQL
)"

if ! JSON="$({ echo "BEGIN;"; echo "$FIXTURES"; cat "$SQL"; echo "ROLLBACK;"; } \
  | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -qAt -v ON_ERROR_STOP=1)"; then
  echo "ECHEC : stats.sql ne passe pas sur la base de test" >&2
  exit 1
fi
if ! jq -e . >/dev/null 2>&1 <<< "$JSON"; then
  echo "ECHEC : la sortie n'est pas du JSON : $JSON" >&2
  exit 1
fi

# Parties : toutes presentes (sauf jamais lancee), drapeau test jamais nul.
egal "$JSON" '[.sessions[] | [.id, .test]]' \
  '[[101,false],[102,true],[103,true],[104,false],[105,true]]' \
  "parties : drapeau test (hote, joueur, id liste, sans hote)"

# Inscriptions : vrais comptes dans n, comptes de test a part.
egal "$JSON" '[.inscriptions[] | [.j, .n, .comptes, .tests]]' \
  '[["2026-10-01",2,1,2],["2026-10-02",2,0,5]]' \
  "inscriptions : n et comptes hors tests, tests a part"

egal "$JSON" '[.joueurs[].pseudo]' '["Alice"]' \
  "classement : personas ecartes"

egal "$JSON" '[.titres[] | [.titre, .joue, .reponses, .bonnes]]' '[["Titre A",2,3,2]]' \
  "titres : manches des parties de test ignorees"

egal "$JSON" '[.liens[] | [.provider, .n, .joue, .tests]] | sort' \
  '[["inconnu",0,0,1],["spotify",1,3,1]]' \
  "liens : hors tests, nombre de liens de test a part"

egal "$JSON" '.totaux | [.joueurs, .comptes, .manches, .reponses]' '[11,3,5,7]' \
  "totaux bruts : tests compris"

egal "$JSON" '.totaux_hors_tests' \
  '{"joueurs":4,"comptes":1,"parties":2,"manches":2,"reponses":3}' \
  "totaux hors tests"

egal "$JSON" '.exclus' '{"comptes_test":7,"parties_test":3}' \
  "exclus : comptes et parties de test"

echo
if [ "$ECHECS" -gt 0 ]; then
  echo "$ECHECS echec(s)"
  exit 1
fi
echo "tous les tests passent"
