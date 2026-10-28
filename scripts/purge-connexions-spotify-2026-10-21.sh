#!/usr/bin/env bash
# T15 : suppression des connexions au compte Spotify (user_connections,
# provider = 'spotify'). La connexion OAuth utilisateur est retiree du code ;
# ces lignes gardent des jetons OAuth qui ne servent plus (derniere mise a jour
# le 10/03/2026, 4 lignes au 17/10). Minimisation des donnees (RGPD).
#
# A lancer UNIQUEMENT a la mise en prod de T15, sur GO de Tym, APRES le
# nouveau backend (l'ancien lisait encore ces lignes) :
#
#   bash /opt/blindify/scripts/purge-connexions-spotify-2026-10-21.sh --prod --compter   # compte, ne touche a rien
#   bash /opt/blindify/scripts/purge-connexions-spotify-2026-10-21.sh --prod
#
# Ce que fait le passage reel :
#   1. compte les lignes Spotify ; s'il n'y en a aucune : « rien a faire »
#      (idempotent, on peut le relancer) ;
#   2. les sauvegarde en CSV dans $BACKUP_DIR (/opt/backups), fichier en 600,
#      et verifie que la sauvegarde a bien le meme nombre de lignes ;
#   3. les supprime dans une transaction qui s'annule si le nombre supprime
#      n'est pas celui compte ;
#   4. affiche le compte apres (attendu : 0).
# Aucun jeton n'est affiche. La sauvegarde, elle, contient les jetons : a
# supprimer le jour meme, une fois la mise en prod validee (decision de Tym du
# 28/10 ; les jetons sont morts, le retour arriere ne servirait plus a rien).
#
# Retour arriere (si vraiment necessaire) :
#   docker exec -i blindify-postgres psql -U blindify -d blindify \
#     -c "\copy user_connections FROM STDIN WITH CSV HEADER" < /opt/backups/<fichier>.csv
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

psql_t() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -qAt "$@"; }
compte() { psql_t -c "SELECT count(*) FROM user_connections WHERE provider = 'spotify'"; }

echo "base : $PG_DB ($PG_CONTAINER)"
AVANT="$(compte)"

if [ "$MODE" = "compter" ]; then
  echo "connexions spotify : $AVANT"
  exit 0
fi

echo "avant : $AVANT"
if [ "$AVANT" = "0" ]; then
  echo "rien a faire"
  exit 0
fi

# Sauvegarde, en 600 des sa creation (umask), jamais affichee.
HORO="$(date +%Y%m%d-%H%M%S)"
SAUVE="$BACKUP_DIR/user_connections-spotify-avant-purge-$HORO.csv"
(
  umask 077
  psql_t -c "\copy (SELECT * FROM user_connections WHERE provider = 'spotify' ORDER BY id) TO STDOUT WITH CSV HEADER" > "$SAUVE"
)
chmod 600 "$SAUVE"
SAUVEES="$(($(wc -l < "$SAUVE") - 1))"
if [ "$SAUVEES" != "$AVANT" ]; then
  echo "ARRET : la sauvegarde a $SAUVEES lignes pour $AVANT comptees, rien n'est supprime" >&2
  exit 1
fi
echo "sauvegarde : $SAUVE ($SAUVEES lignes, 600)"

# Suppression : la transaction s'annule si le nombre supprime differe du compte.
psql_t <<SQL
BEGIN;
DO \$\$
DECLARE n integer;
BEGIN
  DELETE FROM user_connections WHERE provider = 'spotify';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> $AVANT THEN
    RAISE EXCEPTION 'supprimees % pour % comptees, annule', n, $AVANT;
  END IF;
END
\$\$;
COMMIT;
SQL

echo "apres : $(compte)"
