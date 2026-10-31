#!/bin/bash
# Attendre qu'aucune partie ne tourne, AVANT une mise en prod qui redemarre le
# backend. Leger (une lecture en base par minute) : il se lance SANS heavy,
# pour que l'attente ne bloque ni la campagne de nuit ni les autres taches
# lourdes de la machine. Il ne change rien.
#
#   bash scripts/attendre-parties.sh             attend (3 h au plus), 0 des que c'est libre
#   bash scripts/attendre-parties.sh --une-fois  regarde une fois : 0 libre, 1 parties en cours
#
# Avant un git pull, il se lance depuis origin/main sans toucher le depot :
#   git -C /opt/blindify fetch -q origin && git -C /opt/blindify show origin/main:scripts/attendre-parties.sh | bash
#
# GO_PROD_CIBLE=pile : la base de la pile isolee (essais), jamais la prod.
# GO_PROD_CIBLE=dev : la base du site de dev (blindify_dev), pour verifier
# qu'un outil E2E joue sur dev n'y laisse pas de salle ouverte. Hors prod, un
# avertissement part sur stderr et chaque message nomme la base lue : une
# variable restee exportee avant un vrai go-prod ne doit pas passer inapercue.
#
# Salles des outils E2E : tools/salles-de-test.mjs les ferme a la sortie. Un
# outil tue en SIGKILL (code 137 de heavy) laisse la sienne ouverte jusqu'au
# prochain outil E2E lance sur la meme base, qui la rattrape.
# ATTENTE_MAX_S : duree maximale de l'attente (10 800 s par defaut).
# Lecture seule : docker exec sans -i, le script peut arriver par un pipe.
set -euo pipefail
ATTENTE_MAX_S="${ATTENTE_MAX_S:-10800}"
case "${GO_PROD_CIBLE:-prod}" in
  prod) BASE="prod (blindify)"
        lire() { docker exec blindify-postgres psql -U blindify -d blindify -qAt -c "$1"; } ;;
  pile) BASE="pile de test (blindify_test)"
        lire() { docker exec blindz-test-postgres psql -U blindify -d blindify_test -qAt -c "$1"; } ;;
  dev)  BASE="dev (blindify_dev)"
        lire() { docker exec blindz-dev-postgres psql -U blindz_dev -d blindify_dev -qAt -c "$1"; } ;;
  *)    echo "GO_PROD_CIBLE inconnue : ${GO_PROD_CIBLE} (prod, pile ou dev)" >&2; exit 2 ;;
esac
[ "${GO_PROD_CIBLE:-prod}" = prod ] || echo "!! LECTURE DE LA BASE ${BASE} : ce n'est PAS la prod (GO_PROD_CIBLE=${GO_PROD_CIBLE})" >&2
# Parties vivantes : le filtre garde les salles zombies (24 h et plus) hors du
# compte, mais couvre une longue soiree ou un streamer (30 manches de 60 s).
FILTRE="r.status = 'in_progress' AND COALESCE(r.started_at, r.created_at) > now() - interval '3 hours'"
en_cours() { lire "SELECT count(*) FROM multiplayer_rooms r WHERE $FILTRE"; }
# Une salle abandonnee reste in_progress : sa derniere manche dit si quelqu'un
# joue encore (heures en UTC).
salles() {
  lire "SELECT '    ' || r.room_code || ' lancee a ' || to_char(COALESCE(r.started_at, r.created_at), 'HH24:MI')
        || ', derniere manche a ' || COALESCE(to_char(max(GREATEST(gr.created_at, gr.reveal_at, gr.completed_at)), 'HH24:MI'), 'aucune')
        FROM multiplayer_rooms r LEFT JOIN game_rounds gr ON gr.session_id = r.session_id
        WHERE $FILTRE GROUP BY r.room_code, r.started_at, r.created_at ORDER BY 1"
}

if [ "${1:-}" = --une-fois ]; then
  n="$(en_cours)"
  [ "$n" = 0 ] && exit 0
  echo "  $n partie(s) en cours sur la base ${BASE} ($(date -u +%H:%M) UTC) :"
  salles
  exit 1
fi

debut=$(date +%s)
while :; do
  n="$(en_cours)"
  if [ "$n" = 0 ]; then
    if [ "${GO_PROD_CIBLE:-prod}" = prod ]; then
      echo "aucune partie en cours sur la base ${BASE} ($(date -u +%H:%M:%S) UTC) : la mise en prod peut partir"
    else
      echo "aucune partie en cours sur la base ${BASE} ($(date -u +%H:%M:%S) UTC). Ce n'est PAS la prod : rien n'est dit sur une mise en prod."
    fi
    exit 0
  fi
  attendu=$(( $(date +%s) - debut ))
  if [ "$attendu" -ge "$ATTENTE_MAX_S" ]; then
    echo "!! $n partie(s) toujours en cours sur la base ${BASE} apres $(( attendu / 60 )) min : rien n'a change, relancer plus tard."
    salles
    exit 1
  fi
  if [ $(( attendu % 600 )) -lt 60 ]; then
    echo "$(date -u +%H:%M) UTC : $n partie(s) en cours sur la base ${BASE}, on attend"
    salles
  fi
  sleep 60
done
