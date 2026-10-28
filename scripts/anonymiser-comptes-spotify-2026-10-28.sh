#!/usr/bin/env bash
# T15 : anonymisation des anciens comptes Spotify (users.provider = 'spotify').
# Decision de Tym du 28/10 : on efface le nom, l'e-mail, l'avatar et
# l'identifiant Spotify, on met un pseudo neutre, et on garde l'historique des
# parties et les stats. Ces comptes ont ete crees par l'ancienne connexion OAuth
# (retiree le 16/03/2026) ; sans mot de passe ni OAuth, plus personne ne peut s'y
# connecter. Minimisation des donnees (RGPD).
#
# A lancer UNIQUEMENT a la mise en prod de T15, sur GO de Tym, apres le nouveau
# backend :
#
#   bash /opt/blindify/scripts/anonymiser-comptes-spotify-2026-10-28.sh --prod --compter   # compte, ne touche a rien
#   bash /opt/blindify/scripts/anonymiser-comptes-spotify-2026-10-28.sh --prod
#
# Ce que fait le passage reel :
#   1. compte les comptes Spotify pas encore anonymises ; aucun : « rien a faire »
#      (idempotent, on peut le relancer) ;
#   2. sauvegarde ce qui va etre efface (id, identifiant Spotify, nom, e-mail,
#      avatar, pseudos de salle) en CSV dans $BACKUP_DIR (/opt/backups), fichier
#      en 600, et verifie le nombre de lignes ;
#   3. dans une transaction annulee si le nombre de comptes modifies differe :
#      username = 'Joueur anonyme', email et avatar a NULL,
#      provider_id = 'anonyme-<id>' (la contrainte UNIQUE (provider,
#      provider_id) reste tenue), room_participants.nickname a NULL ;
#      l'id ne change pas : parties, stats et morceaux restent rattaches ;
#   4. affiche le compte apres (attendu : 0).
# Aucune donnee n'est affichee. La sauvegarde, elle, contient les donnees
# effacees : a supprimer le jour meme, une fois la mise en prod validee
# (decision de Tym du 28/10).
#
# Hors prod (tests) : PG_CONTAINER, PG_USER, PG_DB et BACKUP_DIR dans l'environnement.

set -euo pipefail

MODE="reel"
PROD=""
for arg in "$@"; do
  case "$arg" in
    --compter) MODE="compter" ;;
    --prod) PROD=1 ;;
    *) echo "usage : $0 [--prod] [--compter]" >&2; exit 2 ;;
  esac
done

if [ -n "$PROD" ]; then
  PG_CONTAINER="blindify-postgres"
  PG_USER="blindify"
  PG_DB="blindify"
  BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
elif [ -z "${PG_CONTAINER:-}" ] || [ -z "${PG_USER:-}" ] || [ -z "${PG_DB:-}" ] || [ -z "${BACKUP_DIR:-}" ]; then
  echo "REFUS : la prod se vise avec --prod ; sinon PG_CONTAINER, PG_USER, PG_DB et BACKUP_DIR" >&2
  exit 2
fi

PSEUDO="Joueur anonyme"
# Un compte deja anonymise : pseudo neutre, ni e-mail ni avatar, identifiant remplace.
A_FAIRE="provider = 'spotify' AND NOT (username = '$PSEUDO' AND email IS NULL AND avatar IS NULL AND provider_id = 'anonyme-' || id)"

psql_t() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -qAt "$@"; }
compte() { psql_t -c "SELECT count(*) FROM users WHERE $A_FAIRE"; }

echo "base : $PG_DB ($PG_CONTAINER)"
AVANT="$(compte)"

if [ "$MODE" = "compter" ]; then
  echo "comptes spotify a anonymiser : $AVANT"
  exit 0
fi

echo "a anonymiser avant : $AVANT"
if [ "$AVANT" = "0" ]; then
  echo "rien a faire"
  exit 0
fi

# Sauvegarde, en 600 des sa creation (umask), jamais affichee. Une ligne par compte.
HORO="$(date +%Y%m%d-%H%M%S)"
SAUVE="$BACKUP_DIR/users-spotify-avant-anonymisation-$HORO.csv"
(
  umask 077
  psql_t -c "\copy (SELECT u.id, u.provider_id, u.username, u.email, u.avatar,
                           (SELECT string_agg(DISTINCT rp.nickname, ' | ') FROM room_participants rp
                             WHERE rp.user_id = u.id AND rp.nickname IS NOT NULL) AS pseudos_de_salle
                    FROM users u WHERE $A_FAIRE ORDER BY u.id) TO STDOUT WITH CSV HEADER" > "$SAUVE"
)
chmod 600 "$SAUVE"
# Chaque ligne de compte commence par son id (l'entete commence par « id »).
SAUVEES="$(grep -c -E '^[0-9]+,' "$SAUVE" || true)"
if [ "$SAUVEES" != "$AVANT" ]; then
  echo "ARRET : la sauvegarde a $SAUVEES comptes pour $AVANT comptes, rien n'est modifie" >&2
  exit 1
fi
echo "sauvegarde : $SAUVE ($SAUVEES comptes, 600)"

# Anonymisation : la transaction s'annule si le nombre de comptes modifies differe.
psql_t <<SQL
BEGIN;
DO \$\$
DECLARE n integer;
BEGIN
  UPDATE room_participants SET nickname = NULL
   WHERE nickname IS NOT NULL AND user_id IN (SELECT id FROM users WHERE $A_FAIRE);
  UPDATE users
     SET username = '$PSEUDO', email = NULL, avatar = NULL, provider_id = 'anonyme-' || id
   WHERE $A_FAIRE;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> $AVANT THEN
    RAISE EXCEPTION 'modifies % pour % comptes, annule', n, $AVANT;
  END IF;
END
\$\$;
COMMIT;
SQL

echo "a anonymiser apres : $(compte)"
