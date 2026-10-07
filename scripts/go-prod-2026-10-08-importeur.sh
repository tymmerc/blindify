#!/bin/bash
# Mise en prod du lot « importeur » (prevu le 08/10/2026), sur GO de Tym, une
# fois #54, #67 et #64 fusionnees dans main et la campagne de la pile verte sur
# ce main.
#
# Ce qui part :
#   #54 chaque joueur garde les morceaux qu'il a importes : table
#       user_audio_sources, migration 005 (plusieurs envois, reprise de
#       l'existant par lots de 2 000, verrou consultatif 5005), colonne
#       game_rounds.owner_user_id, explorateur de base qui la lit
#   #67 autant de manches que demande (complement), sinon « X manches au lieu
#       de Y » dans le front ; pas de migration
#   #64 le bon extrait : ISRC puis recherche stricte (backend seulement), et le
#       rattrapage des ISRC des anciens morceaux Spotify (OUI de Tym : avec le
#       deploiement). Environ 123 appels a l'API Spotify par passage, aucun a
#       Deezer ; il n'ecrit que metadata.isrc.
#   + tout ce qui est deja sur main a ce moment-la (le backend est reconstruit
#     depuis main).
#
# A lancer dans cet ordre :
#
#   1. attendre qu'aucune partie ne tourne, SANS heavy (3 h au plus) :
#      git -C /opt/blindify fetch -q origin && git -C /opt/blindify show origin/main:scripts/attendre-parties.sh | bash
#   2. systemctl stop blindify-dev-backend
#   3. git -C /opt/blindify pull --ff-only
#   4. setsid nohup bash -c 'HEAVY_WAIT=14400 heavy bash /opt/blindify/scripts/go-prod-2026-10-08-importeur.sh SHA_TESTE_SUR_LA_PILE' \
#        > /opt/backups/go-prod-importeur-lancement.log 2>&1 &
#      puis suivre : tail -f /opt/backups/go-prod-importeur-*.log
#
# Toujours detache (setsid nohup, ou en tache de fond), jamais dans un SSH nu :
# une coupure tuerait le script au milieu. Jamais via systemd-run hors de
# user.slice (garde-fous memoire du VPS). Un arret (Ctrl-C, kill) passe par la
# fin du script, qui dit l'etape atteinte, l'etat reel et la commande de retour.
#
# L'arret du backend de dev AVANT le git pull compte : il tourne en
# ts-node-dev depuis /opt/blindify et repart tout seul quand ses fichiers
# changent ; sur le nouveau code, il appliquerait la 005 a la base de prod au
# moment du pull, avant la sauvegarde (vu le 05/10 a 23:50, au pull du lot jeu).
# L'attente est sortie de heavy : la campagne de nuit (03:40 UTC) et les
# autres taches lourdes ne restent plus bloquees jusqu'a 3 h.
#
# SHA_TESTE : le commit de main sur lequel la campagne de la pile est verte.
# main peut l'avoir depasse SEULEMENT par des fichiers de scripts/.
#
# Ordre : 1 garde-fous (rien ne change), 2 controle rapide qu'aucune partie
# ne tourne (sinon on sort sans rien toucher ; FORCE=1 pour passer outre),
# 3 sauvegardes verifiees et fichier de retour, 4 migration 005, 5 backend
# (retour automatique s'il ne demarre pas), 6 verifications (une vraie partie
# lancee : retour automatique si le lancement echoue), 7 front par la voie
# rapide, 8 explorateur de base et backend de dev, 9 rattrapage ISRC (en
# dernier, independant : un echec ne remet pas le backend d'avant).
# Le backend de dev reste arrete jusqu'a l'etape 8.
#
# Duree estimee, une fois les parties finies : moins d'une minute de
# sauvegardes et de migration, 3 a 5 min de build du backend, quelques
# secondes de coupure du jeu au redemarrage (3 s le 06/10), 1 a 2 min de
# verifications (une vraie partie, la sonde a blanc), 3 a 5 min de build du
# front, puis 3 a 4 min de rattrapage (essai sur 3 lots, un lot ecrit et
# controle, puis les quelque 120 lots restants a 1 s d'intervalle). Redemarrer le backend TERMINE les parties en cours
# (leur etat ne vit qu'en memoire). Lancer juste apres un passage de la
# surveillance (blindz-uptime, toutes les 5 min) pour eviter une fausse alerte.
#
# La 005, mesuree sur la pile isolee le 07/10 avec le volume de la prod
# (8 776 morceaux dont 1 456 lies, 2 658 manches), une sonde ecrivant toutes
# les 20 ms (import de morceau, mise a jour de joueur, ecriture de manche,
# lecture) : 0,35 s en tout, pire operation 21 ms, aucune ecriture bloquee.
# Rejouee apres un retour --defaire-005 avec 40 000 morceaux a relier : 5,9 s,
# pire ecriture 133 ms. Si une requete tient une des tables plus de 3 s, la
# transaction du schema abandonne sans rien ecrire (lock_timeout) et le script
# rejoue le fichier (3 essais, 10 s d'ecart) : imports et mises a jour de
# joueur attendent au plus ces 3 s (2,99 s mesurees sur la pile, avec une
# transaction qui tenait audio_sources 8 s), les lectures ne sont pas bloquees.
#
# La 005 et l'ANCIEN backend : il continue de marcher avec elle. Verifie sur
# la pile isolee le 07/10 (tools/test-stack/essai-go-prod-importeur.sh) :
# l'ancien backend (main d'avant le lot) sur la base migree importe, lance une
# salle depuis les bibliotheques, retire une carte, lance un solo, et sa
# campagne de bots est verte ; les declencheurs de la 005 gardent
# user_audio_sources coherent avec ses ecritures (0 orphelin). L'ancien code
# ne lit que audio_sources.user_id, que le nouveau ecrit toujours. Le retour
# arriere ne defait donc PAS la 005 par defaut.
# Pour la defaire quand meme (avant de redeployer autrement, par exemple) :
# `bash <fichier de retour> --defaire-005`, qui retire les deux declencheurs,
# leurs fonctions et la table, et arrete le backend de dev (qui la rejouerait
# en redemarrant). La colonne game_rounds.owner_user_id reste, l'ancien code
# l'ignore. Les liens des seconds importeurs sont alors perdus, comme avant
# le correctif. Teste aussi sur la pile (l'ancien backend repart et joue).
#
# Retour arriere : le fichier /opt/backups/retour-importeur-<horodatage>.sh
# ecrit a l'etape 3 (et affiche). Journal : /opt/backups/go-prod-importeur-<horodatage>.log
# Sortie : 0 tout est fait, 1 arret (le message dit ce qui est en place),
# 3 le lot est en place mais le rattrapage ISRC a echoue (a relancer seul).
#
# Essai sur la pile isolee (jamais la prod) : GO_PROD_CIBLE=pile, voir
# tools/test-stack/essai-go-prod-importeur.sh. En mode pile, la base est celle
# de la pile (:5436), le « backend » est celui de la pile (:3098) et l'image
# est un commit ; le front et le backend de dev ne sont pas touches.
set -euo pipefail
CIBLE="${GO_PROD_CIBLE:-prod}"
case "$CIBLE" in prod|pile) ;; *) echo "GO_PROD_CIBLE : prod ou pile" >&2; exit 2 ;; esac
TESTE="${1:?usage : go-prod-2026-10-08-importeur.sh SHA_TESTE_SUR_LA_PILE}"
HORO="$(date +%Y%m%d-%H%M%S)"
ATTENTE_MAX_S="${ATTENTE_MAX_S:-10800}" # 3 h

if [ "$CIBLE" = prod ]; then
  DEPOT=/opt/blindify
  SAUVE=/opt/backups
  SANTE=https://blindz.app/api/health
  BASE_URL=https://blindz.app
  ORIGINE=https://blindz.app
else
  DEPOT="${PILE_DEPOT:?mode pile : PILE_DEPOT (copie du depot au commit teste)}"
  SAUVE="${PILE_SAUVEGARDES:?mode pile : PILE_SAUVEGARDES (dossier des sauvegardes de l essai)}"
  PILE_RUN=/opt/blindify/.test-stack
  PILE_WT="$PILE_RUN/front"
  PILE_NODE=/root/.nvm/versions/node/v22.21.1/bin/node
  SANTE=http://127.0.0.1:3098/api/health
  BASE_URL=http://127.0.0.1:3098
  ORIGINE=http://blindz-test.localhost:3180
fi
cd "$DEPOT"
mkdir -p "$SAUVE"
JOURNAL="$SAUVE/go-prod-importeur-$HORO.log"
# Le umask restrictif ne vaut que pour les sauvegardes, dans des sous-shells :
# le 06/10, un umask 077 global, herite par go-prod-front.sh, a rendu
# frontend/out illisible pour nginx (500 pendant 18 s).
( umask 077; : > "$JOURNAL" )
# Tout ce qui s'affiche part aussi dans le journal. Aucun secret n'est affiche.
# tee ignore les signaux : un Ctrl-C ou une coupure ne coupe pas le journal
# avant que la fin du script ait dit ou on en est.
exec > >(trap '' INT HUP TERM; exec tee -a "$JOURNAL") 2>&1
RETOUR="(pas encore de fichier de retour)"
RETOUR_FRONT=""
DUMP=""
# L'etat reel, dit par finir() a chaque sortie.
ETAPE="1. garde-fous"
ETAT_005="pas appliquee par ce passage"
ETAT_BACKEND="ancien (rien n'a ete redemarre)"
ETAT_FRONT="ancien"
if [ "$CIBLE" = prod ]; then ETAT_DEV="pas encore verifie (laisse tel quel)"; else ETAT_DEV="sans objet (pile)"; fi
die() { echo "  !! $1"; exit 1; }
finir() {
  local code=$1
  trap - EXIT
  [ "$code" = 0 ] && return 0
  echo
  echo "== ARRET a l'etape « $ETAPE » (code $code, $(date -u +%H:%M:%S) UTC) =="
  echo "  migration 005  : $ETAT_005"
  echo "  backend        : $ETAT_BACKEND"
  echo "  front          : $ETAT_FRONT"
  case "$ETAT_BACKEND" in
    nouveau*) echo "  le lot tourne ; retour du backend seulement si besoin : $RETOUR" ;;
    INCONNU*) echo "  A FAIRE TOUT DE SUITE : $RETOUR" ;;
    *) echo "  backend : rien a remettre, l'ancien tourne" ;;
  esac
  [ "$ETAT_FRONT" = "en reconstruction" ] && echo "  front d'avant : $RETOUR_FRONT"
  if [ "$CIBLE" = prod ] && [ "$ETAT_DEV" = "arrete expres (avant le pull)" ]; then
    # Le backend de dev tourne sur ce main : il applique la 005 en demarrant.
    # On ne le relance que si la base est sauvegardee.
    if [ -n "$DUMP" ] && [ -s "$DUMP" ]; then
      if systemctl start blindify-dev-backend; then ETAT_DEV="relance (base sauvegardee : $DUMP)"; else ETAT_DEV="RELANCE EN ECHEC (systemctl status blindify-dev-backend)"; fi
      if [ "$ETAT_005" = appliquee ]; then
        systemctl restart blindz-db-browser && echo "  explorateur relance (il lit la colonne de la 005)"
      fi
    else
      ETAT_DEV="laisse arrete EXPRES : ne PAS le relancer sur ce main sans sauvegarde, il appliquerait la 005"
      echo "  explorateur : laisse tel quel (ancien code, il tourne)"
    fi
  fi
  echo "  backend de dev : $ETAT_DEV"
  echo "  journal        : $JOURNAL"
}
trap 'finir $?' EXIT
trap 'exit 130' INT TERM HUP
heure() { date -u +%H:%M:%S; }
ms_depuis() { echo $(( ($(date +%s%N) - $1) / 1000000 )); }

if [ "$CIBLE" = prod ]; then
  psql_cible() { docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 -qAt "$@"; }
  dump_cible() { docker exec blindify-postgres pg_dump -U blindify -d blindify; }
else
  psql_cible() { docker exec -i blindz-test-postgres psql -U blindify -d blindify_test -v ON_ERROR_STOP=1 -qAt "$@"; }
  dump_cible() { docker exec blindz-test-postgres pg_dump -U blindify -d blindify_test; }
fi
sql() { psql_cible -c "$1"; }
# Parties vivantes : le filtre garde les salles zombies (24 h et plus) hors du
# compte, mais couvre une longue soiree ou un streamer (30 manches de 60 s).
en_cours() { sql "SELECT count(*) FROM multiplayer_rooms WHERE status = 'in_progress' AND COALESCE(started_at, created_at) > now() - interval '3 hours'"; }
# Morceaux qui ont un premier importeur mais pas son lien : doit rester a 0.
orphelins() { sql "SELECT count(*) FROM audio_sources a WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_audio_sources ua WHERE ua.user_id = a.user_id AND ua.audio_source_id = a.id)"; }
present() { grep -qF -- "$1" "$2" 2>/dev/null || die "main incomplet : « $1 » absent de $2"; }

echo "── 1. Garde-fous ($CIBLE, rien ne change pendant cette etape) ──"
TESTE_SHA="$(git rev-parse --verify --quiet "$TESTE^{commit}")" || die "commit teste inconnu : $TESTE"
HEAD_DEBUT="$(git rev-parse HEAD)"
# Rejoue a l'etape 1 et juste avant le build : main = origin/main, le commit
# teste en est un ancetre et main ne l'a depasse que dans scripts/, et HEAD
# n'a pas bouge depuis le debut.
gardes_main() {
  [ "$(git rev-parse HEAD)" = "$HEAD_DEBUT" ] || die "HEAD a bouge depuis l'etape 1 ($(git rev-parse --short HEAD) au lieu de ${HEAD_DEBUT:0:7})"
  if [ "$CIBLE" = prod ]; then
    git fetch -q origin
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "le dossier n'est pas sur origin/main (main a bouge ?) : la prod se deploie depuis main"
    git merge-base --is-ancestor "$TESTE_SHA" HEAD || die "le commit teste n'est pas un ancetre de main"
    local hors_scripts
    hors_scripts="$(git diff --name-only "$TESTE_SHA" HEAD | grep -v '^scripts/' || true)"
    [ -z "$hors_scripts" ] || die "main a change depuis le commit teste ailleurs que dans scripts/ : $hors_scripts"
  else
    [ "$HEAD_DEBUT" = "$TESTE_SHA" ] || die "PILE_DEPOT n'est pas au commit teste"
  fi
}
gardes_main
[ -z "$(git status --short backend/ frontend/ tools/ infra/ scripts/ docker-compose.yml | grep -v '^??' || true)" ] \
  || die "modifications non commitees dans backend/, frontend/, tools/, infra/, scripts/ ou docker-compose.yml"
[ -z "$(git status --short --untracked-files=all backend/src backend/migrations backend/package.json backend/package-lock.json)" ] \
  || die "fichiers non suivis ou modifies dans le backend (ils partiraient dans l'image)"
# Le lot, et rien que le lot cote base : 003 et 004 sont deja en prod.
M005=backend/migrations/005_user_audio_sources.sql
for f in backend/migrations/*; do
  case "${f#backend/migrations/}" in 003_challenges.sql|004_game_feedback.sql|005_user_audio_sources.sql) ;;
    *) die "migration hors lot dans backend/migrations : $f" ;; esac
done
[ -f "$M005" ] || die "$M005 absente : #54 n'est pas dans ce main"
present '-- @envoi' "$M005"                                                      # 54
present 'pg_advisory_xact_lock(5005)' "$M005"                                    # 54
present ensureUserTracksSchema backend/src/services/userTracks.ts                # 54
present ensureUserTracksSchema backend/src/index.ts                              # 54
present 'COALESCE(gr.owner_user_id, a.user_id)' tools/db-browser.mjs             # 54
present topUpPlayable backend/src/services/roundTopUp.ts                         # 67
present requestedRounds backend/src/controllers/roomsController.ts               # 67
present 'pas assez de titres jouables dans vos playlists' frontend/src/lib/roundCount.ts # 67
present parseTitle backend/src/services/previewMatch.ts                          # 64
present 'isrc:' backend/src/services/deezerPreviewService.ts                     # 64
# Le rattrapage ISRC de #64 : son chemin a bouge pendant la relecture, on le
# cherche. Il doit etre dans backend/src (donc compile dans l'image) ; ailleurs,
# on ne saurait pas le lancer avec la config de la prod : on s'arrete ici.
RATTRAPAGE_SRC="$(git ls-files | grep -iE '(^|/)rattrapage[-_]?isrc\.(ts|mjs|js)$' || true)"
[ -n "$RATTRAPAGE_SRC" ] || die "rattrapage ISRC introuvable dans main (#64 incomplete) : rien n'est change"
[ "$(echo "$RATTRAPAGE_SRC" | wc -l)" = 1 ] || die "plusieurs rattrapages ISRC trouves : $(echo "$RATTRAPAGE_SRC" | tr '\n' ' ')"
case "$RATTRAPAGE_SRC" in
  backend/src/*.ts) ;;
  *) die "rattrapage ISRC trouve hors de backend/src ($RATTRAPAGE_SRC) : il ne serait pas dans l'image, adapter l'etape 9" ;;
esac
present 'argv.includes("--ecrire")' "$RATTRAPAGE_SRC"
# Le cablage du lot (source ici, dist a l'etape 6) : pas seulement des fichiers
# presents, les appels qui les branchent.
CABLAGE=(
  "services/trackResolution|resolvePreviewOutcome"
  "services/trackResolution|hydrateWithinBudget"
  "controllers/roomsController|topUpPlayable"
  "controllers/roomsController|user_audio_sources"
  "controllers/roomsController|correct_artist, owner_user_id)"
  "controllers/quickPlayController|resolvePreview"
  "services/deezerPreviewService|withSlot"
)
for c in "${CABLAGE[@]}"; do present "${c#*|}" "backend/src/${c%%|*}.ts"; done
# Les tetes des trois PR doivent etre dans le commit teste (quel que soit
# l'ordre de leurs fusions).
for pr in 54 67 64; do
  tete="$(gh pr view "$pr" --repo tymmerc/blindify --json headRefOid -q .headRefOid 2>/dev/null || true)"
  [ -n "$tete" ] || die "tete de la PR #$pr illisible (gh) : rien n'a change"
  git cat-file -e "$tete^{commit}" 2>/dev/null || git fetch -q origin "$tete" 2>/dev/null || true
  git merge-base --is-ancestor "$tete" "$TESTE_SHA" 2>/dev/null || die "la tete de #$pr (${tete:0:7}) n'est pas dans le commit teste : rien n'a change"
done
echo "  tetes de #54, #67 et #64 presentes dans le commit teste"
RATTRAPAGE_DIST="$(echo "$RATTRAPAGE_SRC" | sed -e 's#^backend/src/#dist/#' -e 's#\.ts$#.js#')"
NODE22=/root/.nvm/versions/node/v22.21.1/bin/node
echo "  rattrapage ISRC : $RATTRAPAGE_SRC (dans l'image : /app/$RATTRAPAGE_DIST)"
if [ "$CIBLE" = prod ]; then
  ! systemctl is-active --quiet blindify-dev-backend \
    || die "le backend de dev tourne : l'arreter AVANT le git pull (voir l'en-tete). S'il est deja reparti sur ce main, la 005 est peut-etre deja en base : c'est sans danger pour l'ancien backend, mais la sauvegarde ne sera pas d'avant la 005"
  ETAT_DEV="arrete expres (avant le pull)"
  docker inspect -f '{{.State.Running}}' blindify-backend 2>/dev/null | grep -qx true || die "le conteneur blindify-backend ne tourne pas"
  curl -sf -m 15 "$SANTE" >/dev/null || die "la prod ne repond pas AVANT le deploiement : comprendre d'abord"
else
  [ -f "$PILE_RUN/run/backend.commit" ] || die "pile : pas de backend lance (stack.sh up)"
  curl -sf -m 5 "$SANTE" >/dev/null || die "pile : le backend de la pile ne repond pas"
fi
# Assez de place et de memoire, sinon on attend (10 min au plus) puis on sort.
attendre_ressource() { # libelle commande_qui_donne_des_Go minimum
  local i dispo
  for i in $(seq 1 20); do
    dispo="$(eval "$2")"
    [ "${dispo:-0}" -ge "$3" ] && { echo "  [ok] $1 : $dispo Go (minimum $3)"; return 0; }
    echo "  $1 : ${dispo:-?} Go, il en faut $3 ; on attend 30 s"
    sleep 30
  done
  die "$1 : toujours moins de $3 Go apres 10 min ($ETAT_BACKEND_COURT)"
}
ETAT_BACKEND_COURT="rien n'a change"
attendre_ressource "disque libre sur /" "df --output=avail -BG / | tail -1 | tr -dc 0-9" 4
# Un passage precedent a deja ecrit un fichier de retour : apres un echec, le
# vrai retour est celui du PREMIER passage (son image « avant » est celle
# d'avant le lot ; celle de ce passage peut deja etre le lot).
precedents="$(ls -t "$SAUVE"/retour-importeur-*.sh 2>/dev/null || true)"
if [ -n "$precedents" ]; then
  echo "  !! ATTENTION : fichier(s) de retour d'un passage precedent :"
  echo "$precedents" | sed 's/^/       /'
  echo "     Le vrai retour est celui du PREMIER passage ($(echo "$precedents" | tail -1)), pas celui que ce passage va ecrire."
fi
DEJA_005="$(sql "SELECT to_regclass('public.user_audio_sources') IS NOT NULL")"
[ "$DEJA_005" = t ] && echo "  NOTE : user_audio_sources existe deja (005 deja passee, par le backend de dev ?). Elle est rejouable : on continue."
echo "  commit deploye : $(git rev-parse --short HEAD) (campagne verte sur ${TESTE_SHA:0:7})"
echo "  base : $(sql "SELECT count(*) || ' morceaux, ' || count(user_id) || ' lies a ' || count(DISTINCT user_id) || ' joueurs' FROM audio_sources")"

echo "── 2. Aucune partie en cours ? ($(heure)) ──"
# L'attente longue se fait AVANT, sans heavy (scripts/attendre-parties.sh) :
# ici, un seul coup d'oeil.
if bash scripts/attendre-parties.sh --une-fois; then
  echo "  aucune partie en cours"
elif [ "${FORCE:-0}" = 1 ]; then
  echo "  FORCE=1 : ces parties seront perdues (scores, XP, historique) au redemarrage du backend"
else
  die "des parties ont commence depuis l'attente : relancer scripts/attendre-parties.sh puis ce script (rien n'a change)"
fi

ETAPE="3. sauvegardes"
echo "── 3. Sauvegardes (verifiees avant tout changement) ──"
DUMP_FICHIER="$SAUVE/avant-importeur-$HORO.sql.gz"
if ! ( umask 077; set -o pipefail; dump_cible | gzip > "$DUMP_FICHIER" ) \
  || ! gzip -t "$DUMP_FICHIER" || ! zcat "$DUMP_FICHIER" | tail -n 5 | grep -q 'PostgreSQL database dump complete' \
  || [ "$(stat -c %a "$DUMP_FICHIER")" != 600 ] || [ ! -s "$DUMP_FICHIER" ]; then
  rm -f "$DUMP_FICHIER"; die "sauvegarde de la base invalide (rien n'a change)"
fi
# Verifiee : c'est elle qui autorise finir() a relancer le backend de dev.
DUMP="$DUMP_FICHIER"
RETOUR_FICHIER="$SAUVE/retour-importeur-$HORO.sh"
# Remettre un backend : la meme fonction sert au retour automatique (etape 5)
# et au fichier de retour, qui la recopie telle quelle (declare -f).
prod_backend_image() { # image
  cd /opt/blindify
  docker tag "$1" blindify-backend:latest
  docker compose up -d --no-deps backend
  for i in $(seq 1 60); do curl -sf -m 2 https://blindz.app/api/health >/dev/null && break; sleep 2; done
  if curl -sf -m 5 https://blindz.app/api/health >/dev/null; then echo "  backend en ligne ($1)"; else echo "  !! backend hors ligne : docker compose logs backend --tail=100"; return 1; fi
}
pile_backend_commit() { # commit : arrete le backend de la pile, le relance sur ce commit
  local run=/opt/blindify/.test-stack pid
  pid="$(cat "$run/run/backend.pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -qF no-egress.cjs; then
    kill "$pid"
    for i in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$run/run/backend.pid"
  git -C "$run/front" checkout -q --detach "$1"
  bash /opt/blindify/tools/test-stack/stack.sh up
}
if [ "$CIBLE" = prod ]; then
  # L'image qui tourne VRAIMENT, pas forcement celle taguee latest.
  IMAGE_AVANT="blindify-backend:avant-importeur-$HORO"
  docker tag "$(docker inspect -f '{{.Image}}' blindify-backend)" "$IMAGE_AVANT"
  [ "$(docker image inspect -f '{{.Id}}' "$IMAGE_AVANT")" = "$(docker inspect -f '{{.Image}}' blindify-backend)" ] || die "tag de l'image d'avant incorrect"
  ( umask 077
    cp -a .env "$SAUVE/env-prod-avant-importeur-$HORO"
    cp -a .env.dev-backend "$SAUVE/env-dev-backend-avant-importeur-$HORO" )
  cmp -s "$SAUVE/env-prod-avant-importeur-$HORO" .env && cmp -s "$SAUVE/env-dev-backend-avant-importeur-$HORO" .env.dev-backend \
    || die "copie de la config differente de l'original"
  FONCTION_RETOUR="$(declare -f prod_backend_image)"
  REMETTRE_BACKEND="prod_backend_image $IMAGE_AVANT"
  PSQL_RETOUR="docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 -1"
  DUMP_TABLE_RETOUR="docker exec blindify-postgres pg_dump -U blindify -d blindify -t user_audio_sources"
  ARRET_DEV="systemctl stop blindify-dev-backend"
  echo "  image   : $IMAGE_AVANT"
  echo "  config  : $SAUVE/env-prod-avant-importeur-$HORO, $SAUVE/env-dev-backend-avant-importeur-$HORO (mode 600, le lot ne la change pas)"
else
  AVANT_COMMIT="$(cat "$PILE_RUN/run/backend.commit")"
  FONCTION_RETOUR="$(declare -f pile_backend_commit)"
  REMETTRE_BACKEND="pile_backend_commit $AVANT_COMMIT"
  PSQL_RETOUR="docker exec -i blindz-test-postgres psql -U blindify -d blindify_test -v ON_ERROR_STOP=1 -1"
  DUMP_TABLE_RETOUR="docker exec blindz-test-postgres pg_dump -U blindify -d blindify_test -t user_audio_sources"
  ARRET_DEV="true # pile : pas de backend de dev"
  echo "  backend d'avant (pile) : commit ${AVANT_COMMIT:0:7}"
fi
( umask 077; cat > "$RETOUR_FICHIER" <<EOF
#!/bin/bash
# Retour arriere du lot importeur du $HORO ($CIBLE), ecrit par go-prod-2026-10-08-importeur.sh.
#   bash $RETOUR_FICHIER                 remet le backend d'avant (la 005 reste)
#   bash $RETOUR_FICHIER --defaire-005   et retire aussi la 005 (voir plus bas)
# NE PAS l'executer apres un deploiement ulterieur : il remettrait l'image
# d'avant CE lot par-dessus. Apres plusieurs passages du script, le bon
# fichier est celui du PREMIER.
# L'ancien backend marche avec la 005 (verifie sur la pile) : ses declencheurs
# suivent ses imports et ses retraits de carte. Le front du lot marche avec
# l'ancien backend (sans requestedRounds, le message de #67 ne s'affiche pas) :
# il n'est pas remis ici (la commande est plus bas). Ne deplace pas le depot git.
set -euo pipefail
$FONCTION_RETOUR
if [ "\${1:-}" = --defaire-005 ]; then
  # D'abord le backend de dev : il tourne sur le code de main, lit
  # user_audio_sources et rejouerait la 005 en redemarrant.
  $ARRET_DEV
fi
$REMETTRE_BACKEND
if [ "\${1:-}" = --defaire-005 ]; then
  # Les liens des seconds importeurs sont perdus (comme avant le correctif) :
  # on les garde d'abord a part. game_rounds.owner_user_id et son index
  # restent, l'ancien code les ignore.
  ( umask 077; $DUMP_TABLE_RETOUR | gzip > "$SAUVE/user_audio_sources-avant-defaire-$HORO.sql.gz" )
  gzip -t "$SAUVE/user_audio_sources-avant-defaire-$HORO.sql.gz"
  echo "liens gardes : $SAUVE/user_audio_sources-avant-defaire-$HORO.sql.gz"
  # -1 (une seule transaction) est juste ici : rien que des DROP, tout ou rien.
  # lock_timeout : si une requete tient audio_sources, on abandonne sans rien
  # retirer et on recommence (3 essais).
  for essai in 1 2 3; do
    if $PSQL_RETOUR <<'SQL'
SET lock_timeout = '5s';
DROP TRIGGER IF EXISTS audio_sources_lien_proprietaire ON audio_sources;
DROP TRIGGER IF EXISTS audio_sources_lien_retire ON audio_sources;
DROP FUNCTION IF EXISTS audio_sources_lien_proprietaire();
DROP FUNCTION IF EXISTS audio_sources_lien_retire();
DROP TABLE IF EXISTS user_audio_sources;
SQL
    then
      echo "005 defaite (declencheurs, fonctions, table)"
      echo "Le backend de dev doit RESTER ARRETE tant que main contient #54 : il rejouerait la 005 en demarrant."
      exit 0
    fi
    echo "essai \$essai : verrou non obtenu, rien n'est retire ; on recommence dans 10 s"
    sleep 10
  done
  echo "!! 005 PAS defaite apres 3 essais (le backend d'avant est remis, lui)"
  exit 1
fi
EOF
chmod 700 "$RETOUR_FICHIER" )
bash -n "$RETOUR_FICHIER" || die "fichier de retour illisible par bash : $RETOUR_FICHIER (rien n'a change)"
RETOUR="bash $RETOUR_FICHIER"
echo "  base    : $DUMP ($(du -h "$DUMP" | cut -f1), mode 600)"
echo "  retour  : $RETOUR"
echo "  journal : $JOURNAL"

ETAPE="4. migration 005"
echo "── 4. Migration 005 ($(heure)) ──"
# Sans -1 : la reprise fait un COMMIT par lot. Une transaction annulee par le
# lock_timeout (3 s) ou un interblocage n'a rien ecrit : on rejoue le fichier,
# ce qui est fait reste fait. L'ancien backend tourne pendant ce temps.
lies_avant="$(sql "SELECT count(*) FROM audio_sources WHERE user_id IS NOT NULL")"
appliquer_005() {
  local essai sortie
  for essai in 1 2 3; do
    if sortie="$(psql_cible < "$M005" 2>&1)"; then
      echo "$sortie" | grep -v '^\s*$' | sed 's/^/    /' || true
      return 0
    fi
    echo "$sortie" | grep -v '^\s*$' | sed 's/^/    /' || true
    echo "$sortie" | grep -qE 'lock timeout|deadlock detected' || return 1
    echo "  essai $essai : verrou non obtenu, rien n'est a moitie ecrit ; on recommence dans 10 s"
    sleep 10
  done
  return 1
}
t0=$(date +%s%N)
appliquer_005 || die "la 005 a echoue (lire l'erreur ci-dessus) : ancien backend toujours en place, la base garde ce qui est deja passe (rejouable)"
ETAT_005=appliquee
echo "  005 appliquee en $(ms_depuis "$t0") ms ($(heure))"
[ "$(sql "SELECT to_regclass('public.user_audio_sources') IS NOT NULL")" = t ] || die "table user_audio_sources absente apres la 005"
[ "$(sql "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.audio_sources'::regclass AND tgname IN ('audio_sources_lien_proprietaire', 'audio_sources_lien_retire')")" = 2 ] \
  || die "declencheurs de la 005 absents"
[ "$(sql "SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.game_rounds'::regclass AND attname = 'owner_user_id' AND NOT attisdropped")" = 1 ] \
  || die "colonne game_rounds.owner_user_id absente"
[ "$(sql "SELECT to_regclass('public.idx_game_rounds_owner') IS NOT NULL")" = t ] || die "index idx_game_rounds_owner absent"
if [ "$(sql "SELECT count(*) FROM pg_roles WHERE rolname = 'blindz_ro'")" = 1 ]; then
  [ "$(sql "SELECT has_table_privilege('blindz_ro', 'public.user_audio_sources', 'SELECT')")" = t ] || die "l'explorateur (blindz_ro) ne lit pas user_audio_sources"
fi
# Un seul instantane pour tous les comptes : les imports continuent pendant
# ce temps (deux requetes separees peuvent voir un morceau neuf dans l'une et
# pas dans l'autre, vu sur la pile).
read -r n_orph liens lies_apres joueurs_sans_lien cartes_etrangeres <<< "$(sql "SELECT
  (SELECT count(*) FROM audio_sources a WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_audio_sources ua WHERE ua.user_id = a.user_id AND ua.audio_source_id = a.id)),
  (SELECT count(*) FROM user_audio_sources),
  (SELECT count(*) FROM audio_sources WHERE user_id IS NOT NULL),
  (SELECT count(DISTINCT a.user_id) FROM audio_sources a WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_audio_sources ua WHERE ua.user_id = a.user_id)),
  (SELECT count(*) FROM user_audio_sources ua JOIN imported_links il ON il.id = ua.link_id WHERE il.user_id <> ua.user_id)" | tr '|' ' ')"
[ "$n_orph" = 0 ] || die "$n_orph morceau(x) lie(s) a un premier importeur sans son lien dans user_audio_sources"
[ "$liens" -ge "$lies_apres" ] || die "user_audio_sources a $liens liens pour $lies_apres morceaux lies"
[ "$joueurs_sans_lien" = 0 ] || die "$joueurs_sans_lien joueur(s) ont des morceaux sans aucun lien"
[ "$cartes_etrangeres" = 0 ] || die "$cartes_etrangeres lien(s) pointent vers la carte d'un autre joueur"
echo "  [ok] $liens liens pour $lies_apres morceaux lies ($lies_avant avant la 005), 0 orphelin, cartes coherentes (rien a annuler : l'ancien backend tourne avec)"

ETAPE="5. backend"
echo "── 5. Backend ($(heure)) ──"
# Ancien backend toujours en place jusqu'au redemarrage : un arret ici ne
# demande aucun retour (la 005 est sans effet sur lui).
gardes_main
ETAT_BACKEND_COURT="ancien backend toujours en place, la 005 est en base (sans effet sur lui)"
attendre_ressource "memoire disponible" "free -g | awk '/^Mem:/ {print \$7}'" 3
if [ "$CIBLE" = prod ]; then
  docker compose build backend || die "build du backend en echec : ancien backend toujours en place"
  gardes_main
fi
# Le build prend des minutes : une partie a pu commencer entre-temps.
for i in $(seq 1 40); do
  bash scripts/attendre-parties.sh --une-fois && break
  if [ "${FORCE:-0}" = 1 ]; then echo "  FORCE=1 : ces parties seront perdues (scores, XP, historique) au redemarrage"; break; fi
  [ "$i" = 40 ] && die "parties en cours apres 20 min : ancien backend toujours en place. Relancer plus tard"
  echo "  on attend 30 s"; sleep 30
done
retour_backend_auto() {
  echo "  !! $1 : retour automatique au backend d'avant"
  if $REMETTRE_BACKEND; then
    ETAT_BACKEND="ancien (retour automatique fait, la 005 reste : sans effet sur lui)"
    echo "  [ok] backend d'avant remis et en ligne"
  else
    ETAT_BACKEND="INCONNU (retour automatique echoue)"
    echo "  !! RETOUR AUTO ECHOUE, lancer : $RETOUR"
  fi
  exit 1
}
debut=$(date +%s)
DEBUT_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ETAT_BACKEND="nouveau (redemarrage en cours)"
if [ "$CIBLE" = prod ]; then
  docker compose up -d --no-deps backend || retour_backend_auto "docker compose up a echoue"
else
  pile_backend_commit "$TESTE_SHA" || retour_backend_auto "la pile n'a pas demarre le nouveau backend"
fi
# Au demarrage, le nouveau backend rejoue la 005 (quelques ms, rien a reprendre) avant d'ouvrir son port.
until curl -sf -m 2 "$SANTE" >/dev/null; do
  sleep 2
  if [ "$CIBLE" = prod ]; then
    redemarrages="$(docker inspect -f '{{.RestartCount}}' blindify-backend 2>/dev/null || echo 0)"
    [ "${redemarrages:-0}" -ge 2 ] && retour_backend_auto "le backend redemarre en boucle"
  fi
  [ $(( $(date +%s) - debut )) -gt 120 ] && retour_backend_auto "API toujours hors ligne apres 120 s"
done
echo "  API de nouveau en ligne apres $(( $(date +%s) - debut )) s"
ETAT_BACKEND="nouveau (lot en place)"
if [ "$CIBLE" = prod ]; then
  for i in $(seq 1 30); do
    etat="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo inconnu)"
    [ "$etat" = healthy ] && { echo "  [ok] backend healthy (controle docker)"; break; }
    [ "$etat" = unhealthy ] && retour_backend_auto "backend unhealthy"
    sleep 10
    [ "$i" = 30 ] && retour_backend_auto "backend jamais healthy en 5 min"
  done
fi

ETAPE="6. verifications du backend"
echo "── 6. Verifications du backend ($(heure)) ──"
sleep 3
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
avertit() { if eval "$2"; then echo "  [ok] $1"; else echo "  ?? $1"; AVERTISSEMENTS=$((AVERTISSEMENTS + 1)); fi; }
AVERTISSEMENTS=0
# Marqueurs choisis absents de la prod d'avant : des fichiers et des noms
# nouveaux du lot (tsc garde les noms et les chaines).
if [ "$CIBLE" = prod ]; then
  dans_code() { docker exec blindify-backend grep -qF -- "$2" "/app/dist/$1.js"; }
  fichier_code() { docker exec blindify-backend test -f "/app/$1"; }
  echecs_demarrage() { docker logs --since "$DEBUT_ISO" blindify-backend 2>&1 | grep -c _boot_failed || true; }
else
  dans_code() { grep -qF -- "$2" "$PILE_WT/backend/src/$1.ts"; }
  fichier_code() { test -f "$PILE_WT/backend/$(echo "$1" | sed -e 's#^dist/#src/#' -e 's#\.js$#.ts#')"; }
  echecs_demarrage() { grep -c _boot_failed "$PILE_RUN/logs/backend.log" || true; }
fi
code_socket() { curl -s -o /dev/null -w '%{http_code}' -m 15 "$BASE_URL/socket.io/?EIO=4&transport=polling" -H "Origin: $1"; }
verifie "API en ligne" "curl -sf -m 15 $SANTE >/dev/null"
# Les schemas du demarrage sont dans des .catch : un serveur en ligne ne
# prouve pas que la 005 a ete rejouee sans erreur.
verifie "aucun *_boot_failed dans le journal du nouveau backend" "[ \"\$(echecs_demarrage)\" = 0 ]"
verifie "#54 migration 005 rejouee au demarrage" "dans_code index ensureUserTracksSchema && dans_code services/userTracks user_audio_sources"
verifie "#54 le fichier de la 005 est dans l'image" "fichier_code migrations/005_user_audio_sources.sql"
verifie "#67 complement de manches" "dans_code services/roundTopUp topUpPlayable && dans_code controllers/roomsController requestedRounds"
verifie "#64 recherche stricte et ISRC" "dans_code services/previewMatch parseTitle && dans_code services/deezerPreviewService 'isrc:'"
verifie "#64 rattrapage ISRC dans l'image" "fichier_code $RATTRAPAGE_DIST"
for c in "${CABLAGE[@]}"; do
  verifie "cablage : ${c#*|} dans ${c%%|*}" "dans_code '${c%%|*}' '${c#*|}'"
done
verifie "toujours 0 orphelin apres le demarrage du nouveau backend" "[ \"\$(orphelins)\" = 0 ]"
verifie "socket depuis $ORIGINE accepte (200)" "[ \"\$(code_socket $ORIGINE)\" = 200 ]"
verifie "socket depuis une origine etrangere refuse (403)" "[ \"\$(code_socket https://evil.example)\" = 403 ]"
# Le limiteur de Deezer, sans reseau : axios.get remplace par un compteur,
# 30 resolutions en meme temps, jamais plus de 6 appels en vol.
LIMITEUR='const axios = require("axios")
const { DeezerPreviewService } = require(process.env.MODULE)
let enVol = 0, max = 0, appels = 0
axios.get = async () => { appels++; enVol++; max = Math.max(max, enVol); await new Promise(r => setTimeout(r, 40)); enVol--
  return { data: { id: 1, title: "t", readable: true, duration: 200, preview: "https://cdnt-preview.dzcdn.net/essai.mp3" } } }
const s = new DeezerPreviewService()
Promise.all(Array.from({ length: 30 }, (_, i) => s.resolvePreviewOutcome({ title: "t" + i, deezerId: String(1000 + i) })))
  .then(r => { const t = r.filter(o => o.status === "found").length; console.log(`${appels} appels, ${max} en vol au plus, ${t} trouves`); process.exit(max <= 6 && appels >= 30 && t === 30 ? 0 : 1) })
  .catch(e => { console.log("erreur " + e.message); process.exit(1) })'
if [ "$CIBLE" = prod ]; then
  limiteur() { echo "$LIMITEUR" | docker exec -i -e MODULE=/app/dist/services/deezerPreviewService blindify-backend node -; }
else
  limiteur() { echo "$LIMITEUR" | ( cd "$PILE_WT/backend" && MODULE="$PILE_WT/backend/src/services/deezerPreviewService" "$PILE_NODE" -r ts-node/register/transpile-only - ); }
fi
resultat_limiteur="$(limiteur 2>&1)" && code_limiteur=0 || code_limiteur=$?
verifie "#64 limiteur Deezer : $(echo "$resultat_limiteur" | tail -1)" "[ $code_limiteur = 0 ]"
[ "$ko" = 0 ] || die "UNE VERIFICATION DU BACKEND A ECHOUE (voir ci-dessus) : backend du lot en place, front et rattrapage pas faits"

# Une vraie partie : salle, lancement, manche 1 recue, menage. Un echec du
# lancement lui-meme remet le backend d'avant ; un echec AVANT la salle
# (invite, Deezer pour ensemencer) ne prouve rien contre le lot : on s'arrete
# sans retour.
if [ "$CIBLE" = prod ]; then
  partie() { ( cd tools && "$NODE22" game-start-check.mjs prod ); }
  SALLE_CREEE='[ok] salon cree'
else
  partie() { ( cd tools/test-stack && timeout 300 "$PILE_NODE" essai-parcours-base.mjs "verification du script" ); }
  SALLE_CREEE='importe la playlist'
fi
for essai in 1 2; do
  sortie_partie="$(partie 2>&1)" && { echo "$sortie_partie" | sed 's/^/    /'; echo "  [ok] une partie se lance et la manche 1 arrive (lancement caviarde)"; break; }
  echo "$sortie_partie" | sed 's/^/    /'
  if ! echo "$sortie_partie" | grep -F "$SALLE_CREEE" >/dev/null; then
    die "verification de partie impossible avant la salle (invite ou Deezer ?) : backend du lot en place, rien ne prouve qu'il est en cause. Relancer tools/game-start-check.mjs prod a la main"
  fi
  [ "$essai" = 2 ] && retour_backend_auto "le lancement d'une partie echoue deux fois"
  echo "  echec du lancement, nouvel essai dans 30 s"; sleep 30
done

# Le solo par lien, comme la sonde : aucun compte, rien n'est ecrit en base.
# Il depend de Deezer : la partie ci-dessus etant verte, un echec ici n'est pas
# une raison de remettre le backend d'avant.
solo() {
  curl -s -m 90 -X POST "$BASE_URL/api/quick-play" -H 'Content-Type: application/json' -H "Origin: $ORIGINE" \
    -d '{"url":"https://www.deezer.com/fr/playlist/1109890291","count":10}' || true
}
titres() { jq -r 'if .success == true then [.data.tracks[]? | select(.audio_url != null)] | length else 0 end' 2>/dev/null || echo 0; }
reponse_solo="$(solo)"; titres_solo="$(echo "$reponse_solo" | titres)"
if [ "${titres_solo:-0}" -lt 5 ]; then
  echo "  solo par lien : ${titres_solo:-0} titres, nouvel essai dans 45 s"; sleep 45
  reponse_solo="$(solo)"; titres_solo="$(echo "$reponse_solo" | titres)"
fi
if [ "${titres_solo:-0}" -ge 5 ]; then
  echo "  [ok] solo par lien : une playlist Deezer publique donne $titres_solo titres jouables"
else
  AVERTISSEMENTS=$((AVERTISSEMENTS + 1))
  echo "  ?? solo par lien : ${titres_solo:-0} titres, code $(echo "$reponse_solo" | jq -r '.error.code // "inconnu"' 2>/dev/null || echo illisible)"
  echo "     Deezer en direct depuis le VPS : $(curl -s -m 15 https://api.deezer.com/playlist/1109890291 | jq -c '{id, erreur: .error}' 2>/dev/null || echo injoignable)"
  echo "     probablement Deezer, pas le lot (la partie ci-dessus est verte) : a surveiller, pas de retour"
fi
if [ "$CIBLE" = prod ]; then
  # Un seul vrai appel : l'ISRC de You Say Run (OST de My Hero Academia).
  ISRC_REEL='require(process.env.MODULE).deezerPreviewService.resolvePreviewOutcome({ title: "", isrc: "JPZ921607277" })
  .then(o => { const ok = o.status === "found" && !!o.track.preview; console.log(`${o.status}${ok ? ", avec extrait" : ""}`); process.exit(ok ? 0 : 1) })
  .catch(e => { console.log("erreur " + e.message); process.exit(1) })'
  isrc_reel() { echo "$ISRC_REEL" | docker exec -i -e MODULE=/app/dist/services/deezerPreviewService blindify-backend node -; }
  resultat_isrc="$(isrc_reel 2>&1)" && code_isrc=0 || code_isrc=$?
  avertit "#64 un vrai /track/isrc: (titre vide) : $(echo "$resultat_isrc" | tail -1)" "[ $code_isrc = 0 ]"
  # La sonde de la prod, a blanc (ni e-mail ni etat ecrit) : 0 attendu.
  avertit "sonde de la prod a blanc (--dry-run)" "$NODE22 /opt/monitoring/sonde-prod/sonde.mjs --dry-run >/dev/null 2>&1"
  echo "  prochain passage de la sonde : $(systemctl list-timers blindz-sonde-prod.timer --no-pager 2>/dev/null | awk 'NR==2 {print $1, $2, $3, $4}')"
fi

if [ "$CIBLE" = prod ]; then
  ETAPE="7. front"
  echo "── 7. Front (voie rapide, $(heure)) ──"
  # Texte de l'accueil : go-prod-front.sh le cherche dans la page d'accueil, ou
  # le message de #67 n'est pas (il est dans le code de l'ecran de jeu). On lui
  # passe un texte present et on prouve le message de #67 dans les chunks servis.
  echo "  parties en cours juste avant le front : $(en_cours) (le front est reconstruit en place : quelques secondes de 404 sur les pages)"
  # Notre propre copie du site, et sa commande de retour dans le fichier de
  # retour, AVANT le build (go-prod-front.sh garde aussi la sienne).
  FRONT_SAUVE="$SAUVE/front-out-avant-importeur-$HORO"
  cp -a frontend/out "$FRONT_SAUVE" && [ -f "$FRONT_SAUVE/index.html" ] \
    || die "copie du front impossible : backend du lot en place, front pas touche"
  RETOUR_FRONT="rsync -a --delete $FRONT_SAUVE/ /opt/blindify/frontend/out/"
  echo "# Front d'avant, si besoin (pas necessaire pour l'ancien backend) : $RETOUR_FRONT" >> "$RETOUR_FICHIER"
  echo "  site actuel copie : $FRONT_SAUVE"
  ETAT_FRONT="en reconstruction"
  if ! ( umask 022; bash scripts/go-prod-front.sh "titre-fin" ); then
    if [ ! -f frontend/out/index.html ]; then
      rsync -a --delete "$FRONT_SAUVE"/ frontend/out/ && ETAT_FRONT="ancien (remis depuis $FRONT_SAUVE : le build avait vide out/)"
    fi
    die "FRONT ECHOUE : backend du lot en place et sain (ne pas le remettre pour ca), front a traiter. Relancer : heavy bash /opt/blindify/scripts/go-prod-front.sh titre-fin"
  fi
  ETAT_FRONT="nouveau (a verifier)"
  build_id="$(find frontend/out/_next/static -mindepth 1 -maxdepth 1 -type d ! -name chunks ! -name css ! -name media -printf '%f\n' | head -1)"
  [ -n "$build_id" ] || die "build id introuvable dans frontend/out : backend du lot en place, front a verifier"
  chunk67="$(grep -rlF 'pas assez de titres jouables dans vos playlists' frontend/out/_next/static/chunks | head -1 || true)"
  ko=0
  # grep sans -q apres un curl : sous pipefail, -q ferme le tube tot et curl
  # finit en erreur (EPIPE) sur une grosse page, faux rouge.
  verifie "la prod sert le build qui vient d'etre construit ($build_id)" "curl -s -m 30 https://blindz.app/ | grep -F -e \"$build_id\" >/dev/null"
  verifie "#67 message « X manches au lieu de Y » dans le build" "[ -n \"$chunk67\" ]"
  verifie "#67 blindz.app sert ce fichier" "curl -sf -m 30 \"https://blindz.app/${chunk67#frontend/out/}\" | grep -F 'pas assez de titres jouables' >/dev/null"
  [ "$ko" = 0 ] || die "UNE VERIFICATION DU FRONT A ECHOUE : backend du lot en place et sain, front a traiter"
  ETAT_FRONT="nouveau"

  ETAPE="8. explorateur et backend de dev"
  echo "── 8. Explorateur de base et backend de dev ($(heure)) ──"
  # L'explorateur lit game_rounds.owner_user_id depuis #54 : on le relance
  # maintenant que la colonne existe (jusqu'ici il tournait sur l'ancien code).
  systemctl restart blindz-db-browser
  derniere="$(sql "SELECT COALESCE(max(session_id), 0) FROM game_rounds")"
  for i in $(seq 1 15); do curl -sf -m 3 "http://127.0.0.1:3101/session/$derniere" >/dev/null && break; sleep 2; done
  ko=0
  verifie "explorateur de base actif" "systemctl is-active --quiet blindz-db-browser"
  verifie "explorateur : detail de la derniere partie ($derniere) lisible" "curl -sf -m 10 http://127.0.0.1:3101/session/$derniere | grep -F '\"manches\"' >/dev/null"
  echo "  parties en cours avant le demarrage du backend de dev : $(en_cours)"
  systemctl start blindify-dev-backend
  ETAT_DEV="relance"
  for i in $(seq 1 60); do curl -sf -m 2 http://127.0.0.1:3097/api/health >/dev/null && break; sleep 2; done
  verifie "backend de dev reparti (meme commit : il tourne depuis /opt/blindify)" "curl -sf -m 5 http://127.0.0.1:3097/api/health >/dev/null"
  [ "$ko" = 0 ] || die "UNE VERIFICATION DE L'EXPLORATEUR OU DU DEV A ECHOUE : backend et front du lot en place"
else
  echo "── 7 et 8. Front, explorateur et backend de dev : pas sur la pile ──"
fi

ETAPE="9. rattrapage ISRC"
echo "── 9. Rattrapage des ISRC ($(heure)) ──"
# Independant du reste et en dernier : un echec ici ne remet PAS le backend
# d'avant. Reprenable (il ne prend que les morceaux encore sans ISRC).
RATTRAPAGE_OK=0
sans_isrc() { sql "SELECT count(*) FROM audio_sources WHERE provider = 'spotify' AND metadata->>'isrc' IS NULL"; }
rattrapage() { # [--lots N] [--ecrire] ; garde la derniere ligne « fin : » dans FIN_RATTRAPAGE
  local sortie code
  if [ "$CIBLE" = prod ]; then
    sortie="$(docker exec blindify-backend timeout 900 node "$RATTRAPAGE_DIST" "$@" 2>&1)" && code=0 || code=$?
  else
    # La pile n'a pas Internet (no-egress) : l'appel a Spotify y echoue, ce
    # qui exerce le chemin d'echec. Config de la pile, jamais affichee.
    sortie="$( ( cd "$PILE_WT/backend" && set -a && . "$PILE_RUN/run/backend.env" && set +a \
      && timeout 900 "$PILE_NODE" -r /opt/blindify/tools/test-stack/no-egress.cjs node_modules/ts-node/dist/bin.js --transpile-only \
        "${RATTRAPAGE_SRC#backend/}" "$@" ) 2>&1)" && code=0 || code=$?
  fi
  echo "$sortie" | sed 's/^/    /'
  FIN_RATTRAPAGE="$(echo "$sortie" | grep '^fin : ' | tail -1 || true)"
  return "$code"
}
# « fin : T traites, I ISRC trouves, S sans ISRC, E erreurs, W ecrits (arret : ...) »
champ() { echo "$FIN_RATTRAPAGE" | sed -nE "s/.* ([0-9]+) $1.*/\1/p"; }
avant_isrc="$(sans_isrc)"
echo "  morceaux Spotify sans ISRC avant : $avant_isrc"
echo "  essai sur 3 lots (rien n'est ecrit) :"
if ! rattrapage --lots 3; then
  echo "  !! essai du rattrapage en echec : rien n'est ecrit"
elif [ -z "$FIN_RATTRAPAGE" ] || [ "$(champ erreurs)" != 0 ] || echo "$FIN_RATTRAPAGE" | grep -F '(arret' >/dev/null \
  || [ "$(champ traites)" -eq 0 ] || [ $(( $(champ 'ISRC trouves') * 100 )) -lt $(( $(champ traites) * 80 )) ]; then
  echo "  !! essai pas assez propre (erreurs, arret anticipe ou moins de 80 % d'ISRC trouves) : rien n'est ecrit"
else
  echo "  premier lot en ecriture :"
  if ! rattrapage --lots 1 --ecrire; then
    echo "  !! premier lot en echec (ce qui est ecrit reste, rien d'autre)"
  else
    ecrits1="$(champ ecrits)"; apres1="$(sans_isrc)"
    if [ $(( avant_isrc - apres1 )) -ne "${ecrits1:-0}" ]; then
      echo "  !! premier lot : $ecrits1 ecrits mais $(( avant_isrc - apres1 )) morceaux en moins sans ISRC : on s'arrete la"
    else
      echo "  [ok] premier lot : $ecrits1 ISRC ecrits, compte coherent ; le reste :"
      if rattrapage --ecrire; then
        ecrits2="$(champ ecrits)"; apres2="$(sans_isrc)"
        if [ $(( apres1 - apres2 )) -eq "${ecrits2:-0}" ]; then
          RATTRAPAGE_OK=1
          echo "  [ok] rattrapage termine : $(( ecrits1 + ecrits2 )) ISRC ecrits, $apres2 morceaux Spotify encore sans ISRC"
        else
          echo "  !! $ecrits2 ecrits mais $(( apres1 - apres2 )) morceaux en moins sans ISRC : a regarder"
        fi
      else
        echo "  !! rattrapage en ecriture en echec ou incomplet (deja ecrit : garde). Sans ISRC : $(sans_isrc)"
      fi
    fi
  fi
fi
[ "$RATTRAPAGE_OK" = 1 ] || echo "  (le lot reste en place ; relancer plus tard : docker exec blindify-backend node $RATTRAPAGE_DIST --lots 3, puis --ecrire)"
ETAPE="10. resume"

echo
if [ "$CIBLE" = pile ]; then
  echo "ESSAI SUR LA PILE TERMINE ($(git rev-parse --short HEAD)). Avertissements : $AVERTISSEMENTS. Rattrapage : $([ "$RATTRAPAGE_OK" = 1 ] && echo ok || echo ECHEC). Retour : $RETOUR"
  [ "$RATTRAPAGE_OK" = 1 ] || exit 3
  exit 0
fi
echo "DEPLOIEMENT DU LOT IMPORTEUR TERMINE ($(git rev-parse --short HEAD), $(heure))"
echo "  fait    : 005 en base ($(sql "SELECT count(*) FROM user_audio_sources") liens), backend #54 #67 #64, front #67, explorateur, backend de dev"
echo "  avertissements (Deezer, sonde) : $AVERTISSEMENTS"
echo "  ISRC    : $([ "$RATTRAPAGE_OK" = 1 ] && echo "rattrapage fait, $(sans_isrc) morceaux Spotify encore sans ISRC" || echo "RATTRAPAGE PAS FAIT OU INCOMPLET, a relancer (voir etape 9)")"
echo "  retour  : $RETOUR   (--defaire-005 pour retirer aussi la 005)"
echo "  journal : $JOURNAL"
echo "A faire ensuite :"
echo "  - bash tools/schema-snapshot.sh puis une PR pour backend/db/schema.sql (table user_audio_sources, colonne owner_user_id)"
echo "  - effacer les copies de config une fois tout valide : $SAUVE/env-*-avant-importeur-$HORO"
echo "  - parcours complets sur blindz.app, un a la fois :"
echo "      cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "      cd /opt/blindify/tools && heavy node party-4-joueurs.mjs prod"
echo "      cd /opt/blindify/tools && heavy node anticheat-e2e.mjs prod"
[ "$RATTRAPAGE_OK" = 1 ] || exit 3
