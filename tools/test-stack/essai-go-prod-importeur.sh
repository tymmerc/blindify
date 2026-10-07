#!/usr/bin/env bash
# Essai de scripts/go-prod-2026-10-08-importeur.sh sur la PILE ISOLEE, jamais
# sur la prod. Une seule tache lourde (la pile n'est qu'a une tache a la fois) :
#
#   HEAVY_WAIT=14400 heavy bash tools/test-stack/essai-go-prod-importeur.sh AVANT NOUVEAU DEPOT DOSSIER
#
#   AVANT    commit du backend en place avant le lot (main, schema 004)
#   NOUVEAU  commit du lot (#54, #67, #64), sorti dans DEPOT avec le script
#   DOSSIER  sauvegardes, journaux et mesures de l'essai
#
# 1. pile neuve sur AVANT, volume comparable a la prod (essai-volume-prod.sql)
# 2. garde-fous : mauvais commit, partie en cours : le script doit sortir sans
#    rien toucher
# 3. le script en mode pile, la sonde des verrous tourne pendant tout le passage
# 4. nouveau backend : parcours d'import et de salle, campagne de bots
# 5. retour arriere (fichier ecrit par le script) : l'ancien backend sur la
#    base migree, memes parcours, campagne de bots
# 6. retour avec --defaire-005 : l'ancien backend sans la 005, memes parcours
# 7. second passage du script avec une longue transaction en face de la 005
# La pile est demontee a la fin et sa copie de travail remise sur son commit.
set -uo pipefail
AVANT="${1:?commit AVANT}"; NOUVEAU="${2:?commit NOUVEAU}"; DEPOT="${3:?DEPOT}"; DOSSIER="${4:?DOSSIER}"
ROOT=/opt/blindify
HERE="$ROOT/tools/test-stack"
MES="$(cd "$(dirname "$0")" && pwd)"   # les fichiers de l'essai (ce dossier, dans le depot teste)
NODE=/root/.nvm/versions/node/v22.21.1/bin/node
SCRIPT="$DEPOT/scripts/go-prod-2026-10-08-importeur.sh"
PG() { docker exec -i blindz-test-postgres psql -U blindify -d blindify_test -v ON_ERROR_STOP=1 -qAt "$@"; }
mkdir -p "$DOSSIER"
bilan=()
note() { echo "$1"; bilan+=("$1"); }
etape() { echo; echo "=================== $1 ($(date -u +%T)) ==================="; }
FRONT_COMMIT_AVANT="$(cut -d' ' -f1 "$ROOT/.test-stack/front.commit" 2>/dev/null || true)"
fin() {
  [ -n "${SONDE_PID:-}" ] && kill "$SONDE_PID" 2>/dev/null
  (cd "$HERE" && ./stack.sh down >/dev/null 2>&1)
  # La copie de travail de la pile doit retrouver le commit que front.commit
  # annonce, sinon la tache suivante testerait le mauvais backend.
  if [ -n "$FRONT_COMMIT_AVANT" ] && [ -e "$ROOT/.test-stack/front/.git" ]; then
    git -C "$ROOT/.test-stack/front" checkout -q --detach "$(cut -d' ' -f1 "$ROOT/.test-stack/front.commit")"
  fi
}
trap fin EXIT
trap 'exit 130' INT TERM HUP

etape "1. pile neuve sur ${AVANT:0:7}, volume de la prod"
cd "$HERE" || exit 1
./stack.sh down >/dev/null 2>&1
STACK_REF="$AVANT" timeout 25m ./stack.sh front || { echo "ECHEC build du front de test"; exit 1; }
timeout 5m ./stack.sh up || { echo "ECHEC demarrage de la pile"; exit 1; }
PG < "$MES/essai-volume-prod.sql" || { echo "ECHEC du volume"; exit 1; }

etape "2. garde-fous"
GO_PROD_CIBLE=pile PILE_DEPOT="$DEPOT" PILE_SAUVEGARDES="$DOSSIER/garde" bash "$SCRIPT" "$AVANT" > "$DOSSIER/garde-commit.log" 2>&1
code=$?; tail -3 "$DOSSIER/garde-commit.log"
[ $code -ne 0 ] && [ "$(PG -c "SELECT to_regclass('public.user_audio_sources') IS NULL")" = t ] \
  && note "[ok] mauvais commit : sortie $code, base intacte" || note "!! mauvais commit : sortie $code"
PG -c "INSERT INTO multiplayer_rooms (room_code, status, started_at) VALUES ('ESSAI1', 'in_progress', now())"
ATTENTE_MAX_S=5 GO_PROD_CIBLE=pile PILE_DEPOT="$DEPOT" PILE_SAUVEGARDES="$DOSSIER/garde" bash "$SCRIPT" "$NOUVEAU" > "$DOSSIER/garde-partie.log" 2>&1
code=$?; tail -3 "$DOSSIER/garde-partie.log"
[ $code -ne 0 ] && grep -q 'SANS RIEN TOUCHER' "$DOSSIER/garde-partie.log" && [ "$(PG -c "SELECT to_regclass('public.user_audio_sources') IS NULL")" = t ] \
  && note "[ok] partie en cours : sortie $code sans rien toucher" || note "!! partie en cours : sortie $code"
PG -c "DELETE FROM multiplayer_rooms WHERE room_code = 'ESSAI1'"

etape "3. le script, mode pile"
SONDE_PAS_MS=20 "$NODE" "$MES/sonde-verrous.mjs" "$DOSSIER/sonde-verrous.txt" > "$DOSSIER/sonde-verrous.log" 2>&1 &
SONDE_PID=$!
sleep 2
t0=$(date +%s)
GO_PROD_CIBLE=pile PILE_DEPOT="$DEPOT" PILE_SAUVEGARDES="$DOSSIER/passage" bash "$SCRIPT" "$NOUVEAU" 2>&1 | tee "$DOSSIER/passage.log"
code=${PIPESTATUS[0]}
kill "$SONDE_PID"; wait "$SONDE_PID"; SONDE_PID=
note "script : sortie $code en $(( $(date +%s) - t0 )) s (3 attendu : le rattrapage echoue faute d'Internet, signale sans retour arriere)"
grep -E '005 appliquee|API de nouveau|\[ok\]|!!' "$DOSSIER/passage.log" | sed 's/^/    /'
note "sonde : $(head -5 "$DOSSIER/sonde-verrous.txt" | tail -4 | tr '\n' ';')"
note "fenetre de la 005 : $(grep -h '005 appliquee' "$DOSSIER/passage.log")"
[ "$(cut -c1-40 "$ROOT/.test-stack/run/backend.commit")" = "$NOUVEAU" ] && note "[ok] la pile tourne sur le lot" || note "!! la pile ne tourne pas sur le lot"

etape "4. nouveau backend"
(cd "$MES" && timeout 5m "$NODE" essai-parcours-base.mjs "nouveau backend") > "$DOSSIER/parcours-nouveau.log" 2>&1
note "parcours, nouveau backend : sortie $? ($(tail -1 "$DOSSIER/parcours-nouveau.log"))"
(cd "$HERE" && timeout 10m "$NODE" campaign.mjs --no-browser --seed 8) > "$DOSSIER/campagne-nouveau.log" 2>&1
note "campagne de bots, nouveau backend : sortie $?"

etape "5. retour arriere (la 005 reste)"
RETOUR_FICHIER="$(ls -t "$DOSSIER"/passage/retour-importeur-*.sh | head -1)"
t0=$(date +%s)
bash "$RETOUR_FICHIER" > "$DOSSIER/retour.log" 2>&1
code=$?
note "retour : sortie $code en $(( $(date +%s) - t0 )) s, pile sur $(cut -c1-7 "$ROOT/.test-stack/run/backend.commit") (attendu ${AVANT:0:7})"
(cd "$MES" && timeout 5m "$NODE" essai-parcours-base.mjs "ancien backend, base avec la 005") > "$DOSSIER/parcours-ancien-005.log" 2>&1
note "parcours, ancien backend avec la 005 : sortie $? ($(tail -1 "$DOSSIER/parcours-ancien-005.log"))"
(cd "$HERE" && timeout 10m "$NODE" campaign.mjs --no-browser --seed 8) > "$DOSSIER/campagne-ancien-005.log" 2>&1
note "campagne de bots, ancien backend avec la 005 : sortie $?"
note "orphelins apres l'ancien backend : $(PG -c "SELECT count(*) FROM audio_sources a WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_audio_sources ua WHERE ua.user_id = a.user_id AND ua.audio_source_id = a.id)")"

etape "6. retour avec --defaire-005"
bash "$RETOUR_FICHIER" --defaire-005 > "$DOSSIER/retour-defaire-005.log" 2>&1
code=$?
note "retour --defaire-005 : sortie $code, table $(PG -c "SELECT COALESCE(to_regclass('public.user_audio_sources')::text, 'absente')"), declencheurs $(PG -c "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.audio_sources'::regclass AND NOT tgisinternal")"
(cd "$MES" && timeout 5m "$NODE" essai-parcours-base.mjs "ancien backend, 005 defaite") > "$DOSSIER/parcours-ancien-sans-005.log" 2>&1
note "parcours, ancien backend sans la 005 : sortie $? ($(tail -1 "$DOSSIER/parcours-ancien-sans-005.log"))"

etape "7. second passage, une longue transaction tient audio_sources pendant la 005"
# Pire cas : une requete garde audio_sources 8 s. La transaction du schema
# abandonne au bout de 3 s (lock_timeout) sans rien ecrire, le script rejoue
# la 005. Le second passage teste aussi la relance apres un retour arriere.
SONDE_PAS_MS=20 "$NODE" "$MES/sonde-verrous.mjs" "$DOSSIER/sonde-verrous-2.txt" > "$DOSSIER/sonde-verrous-2.log" 2>&1 &
SONDE_PID=$!
PG > "$DOSSIER/bloqueur.log" 2>&1 <<'SQL' &
BEGIN;
LOCK TABLE audio_sources IN ROW EXCLUSIVE MODE;
SELECT pg_sleep(8);
COMMIT;
SQL
sleep 1
GO_PROD_CIBLE=pile PILE_DEPOT="$DEPOT" PILE_SAUVEGARDES="$DOSSIER/passage2" bash "$SCRIPT" "$NOUVEAU" > "$DOSSIER/passage2.log" 2>&1
code=$?
kill "$SONDE_PID"; wait "$SONDE_PID"; SONDE_PID=
wait
note "second passage : sortie $code ; $(grep -c 'verrou non obtenu' "$DOSSIER/passage2.log") essai(s) rejoue(s) apres lock_timeout ; $(grep -h '005 appliquee' "$DOSSIER/passage2.log")"
note "sonde 2 : $(head -5 "$DOSSIER/sonde-verrous-2.txt" | tail -4 | tr '\n' ';')"
grep -E '\[ok\]|!!' "$DOSSIER/passage2.log" | sed 's/^/    /'

echo; echo "=================== BILAN ==================="
printf '%s\n' "${bilan[@]}" | tee "$DOSSIER/bilan.txt"
