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
# A lancer dans cet ordre (l'arret du backend de dev AVANT le git pull compte :
# il tourne en ts-node-dev depuis /opt/blindify et repart tout seul quand ses
# fichiers changent ; sur le nouveau code, il appliquerait la 005 a la base de
# prod au moment du pull, avant la sauvegarde, vu le 05/10 a 23:50) :
#
#   systemctl stop blindify-dev-backend
#   git -C /opt/blindify pull --ff-only
#   HEAVY_WAIT=14400 heavy bash /opt/blindify/scripts/go-prod-2026-10-08-importeur.sh SHA_TESTE_SUR_LA_PILE
#
# SHA_TESTE : le commit de main sur lequel la campagne de la pile est verte.
# main peut l'avoir depasse SEULEMENT par des fichiers de scripts/.
#
# Ordre : 1 garde-fous (rien ne change), 2 attente qu'aucune partie ne tourne
# (3 h au plus, sinon on sort sans rien toucher ; FORCE=1 pour passer outre),
# 3 sauvegardes verifiees et fichier de retour, 4 migration 005, 5 backend
# (retour automatique s'il ne demarre pas), 6 verifications, 7 rattrapage
# ISRC, 8 front par la voie rapide, 9 explorateur de base et backend de dev.
# L'attente de l'etape 2 garde le verrou de heavy : aucune autre tache lourde
# pendant ce temps. Le backend de dev reste arrete jusqu'a l'etape 9.
#
# Duree estimee, une fois les parties finies : moins d'une minute de
# sauvegardes et de migration, 3 a 5 min de build du backend, quelques
# secondes de coupure du jeu au redemarrage (3 s le 06/10), 5 a 6 min de
# rattrapage (essai puis ecriture, 123 lots de 50 a 1 s d'intervalle), 3 a
# 5 min de build du front. Redemarrer le backend TERMINE les parties en cours
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
# rejoue le fichier (3 essais) ; les ecritures attendent au plus ces 3 s.
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
exec > >(tee -a "$JOURNAL") 2>&1
RETOUR="(pas encore de changement)"
die() { echo "  !! $1"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }
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
# Pour decider d'un FORCE=1 : une salle abandonnee reste in_progress, sa
# derniere manche dit si quelqu'un joue encore.
salles_en_cours() { sql "SELECT '    ' || r.room_code || ' lancee a ' || to_char(COALESCE(r.started_at, r.created_at), 'HH24:MI') || ', derniere manche a ' || COALESCE(to_char(max(GREATEST(gr.created_at, gr.reveal_at, gr.completed_at)), 'HH24:MI'), 'aucune') FROM multiplayer_rooms r LEFT JOIN game_rounds gr ON gr.session_id = r.session_id WHERE r.status = 'in_progress' AND COALESCE(r.started_at, r.created_at) > now() - interval '3 hours' GROUP BY r.room_code, r.started_at, r.created_at"; }
# Morceaux qui ont un premier importeur mais pas son lien : doit rester a 0.
orphelins() { sql "SELECT count(*) FROM audio_sources a WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_audio_sources ua WHERE ua.user_id = a.user_id AND ua.audio_source_id = a.id)"; }
present() { grep -qF -- "$1" "$2" 2>/dev/null || die "main incomplet : « $1 » absent de $2"; }

echo "── 1. Garde-fous ($CIBLE, rien ne change pendant cette etape) ──"
TESTE_SHA="$(git rev-parse --verify --quiet "$TESTE^{commit}")" || die "commit teste inconnu : $TESTE"
if [ "$CIBLE" = prod ]; then
  git fetch -q origin
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "le dossier n'est pas sur origin/main : la prod se deploie depuis main"
  git merge-base --is-ancestor "$TESTE_SHA" HEAD || die "le commit teste n'est pas un ancetre de main"
  hors_scripts="$(git diff --name-only "$TESTE_SHA" HEAD | grep -v '^scripts/' || true)"
  [ -z "$hors_scripts" ] || die "main a change depuis le commit teste ailleurs que dans scripts/ : $hors_scripts"
else
  [ "$(git rev-parse HEAD)" = "$TESTE_SHA" ] || die "PILE_DEPOT n'est pas au commit teste"
fi
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
  *) die "rattrapage ISRC trouve hors de backend/src ($RATTRAPAGE_SRC) : il ne serait pas dans l'image, adapter l'etape 7" ;;
esac
present '--ecrire' "$RATTRAPAGE_SRC"
RATTRAPAGE_DIST="$(echo "$RATTRAPAGE_SRC" | sed -e 's#^backend/src/#dist/#' -e 's#\.ts$#.js#')"
echo "  rattrapage ISRC : $RATTRAPAGE_SRC (dans l'image : /app/$RATTRAPAGE_DIST)"
if [ "$CIBLE" = prod ]; then
  ! systemctl is-active --quiet blindify-dev-backend \
    || die "le backend de dev tourne : l'arreter AVANT le git pull (voir l'en-tete). S'il est deja reparti sur ce main, la 005 est peut-etre deja en base : c'est sans danger pour l'ancien backend, mais la sauvegarde ne sera pas d'avant la 005"
  docker inspect -f '{{.State.Running}}' blindify-backend 2>/dev/null | grep -qx true || die "le conteneur blindify-backend ne tourne pas"
  curl -sf -m 15 "$SANTE" >/dev/null || die "la prod ne repond pas AVANT le deploiement : comprendre d'abord"
else
  [ -f "$PILE_RUN/run/backend.commit" ] || die "pile : pas de backend lance (stack.sh up)"
  curl -sf -m 5 "$SANTE" >/dev/null || die "pile : le backend de la pile ne repond pas"
fi
DEJA_005="$(sql "SELECT to_regclass('public.user_audio_sources') IS NOT NULL")"
[ "$DEJA_005" = t ] && echo "  NOTE : user_audio_sources existe deja (005 deja passee, par le backend de dev ?). Elle est rejouable : on continue."
echo "  commit deploye : $(git rev-parse --short HEAD) (campagne verte sur ${TESTE_SHA:0:7})"
echo "  base : $(sql "SELECT count(*) || ' morceaux, ' || count(user_id) || ' lies a ' || count(DISTINCT user_id) || ' joueurs' FROM audio_sources")"

echo "── 2. Attente : aucune partie en cours ($(heure)) ──"
debut_attente=$(date +%s)
while :; do
  n="$(en_cours)"
  [ "$n" = 0 ] && { echo "  aucune partie en cours"; break; }
  [ "${FORCE:-0}" = 1 ] && { echo "  FORCE=1 : $n partie(s) en cours seront terminees"; break; }
  attendu=$(( $(date +%s) - debut_attente ))
  if [ "$attendu" -ge "$ATTENTE_MAX_S" ]; then
    echo "  !! $n partie(s) toujours en cours apres $(( attendu / 60 )) min : on sort SANS RIEN TOUCHER. Relancer plus tard."
    exit 1
  fi
  [ $(( attendu % 600 )) -lt 60 ] && { echo "  $(heure) : $n partie(s) en cours, on attend (UTC)"; salles_en_cours; }
  sleep 60
done

echo "── 3. Sauvegardes (verifiees avant tout changement) ──"
DUMP="$SAUVE/avant-importeur-$HORO.sql.gz"
if ! ( umask 077; set -o pipefail; dump_cible | gzip > "$DUMP" ) \
  || ! gzip -t "$DUMP" || ! zcat "$DUMP" | tail -n 5 | grep -q 'PostgreSQL database dump complete' \
  || [ "$(stat -c %a "$DUMP")" != 600 ] || [ ! -s "$DUMP" ]; then
  rm -f "$DUMP"; die "sauvegarde de la base invalide"
fi
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
  ARRET_DEV="systemctl stop blindify-dev-backend"
  echo "  image   : $IMAGE_AVANT"
  echo "  config  : $SAUVE/env-prod-avant-importeur-$HORO, $SAUVE/env-dev-backend-avant-importeur-$HORO (mode 600, le lot ne la change pas)"
else
  AVANT_COMMIT="$(cat "$PILE_RUN/run/backend.commit")"
  FONCTION_RETOUR="$(declare -f pile_backend_commit)"
  REMETTRE_BACKEND="pile_backend_commit $AVANT_COMMIT"
  PSQL_RETOUR="docker exec -i blindz-test-postgres psql -U blindify -d blindify_test -v ON_ERROR_STOP=1 -1"
  ARRET_DEV="true # pile : pas de backend de dev"
  echo "  backend d'avant (pile) : commit ${AVANT_COMMIT:0:7}"
fi
( umask 077; cat > "$RETOUR_FICHIER" <<EOF
#!/bin/bash
# Retour arriere du lot importeur du $HORO ($CIBLE), ecrit par go-prod-2026-10-08-importeur.sh.
#   bash $RETOUR_FICHIER                 remet le backend d'avant (la 005 reste)
#   bash $RETOUR_FICHIER --defaire-005   et retire aussi la 005 (voir plus bas)
# L'ancien backend marche avec la 005 (verifie sur la pile) : ses declencheurs
# suivent ses imports et ses retraits de carte. Le front du lot marche avec
# l'ancien backend (sans requestedRounds, le message de #67 ne s'affiche pas) :
# il n'est pas remis ici. Ne deplace pas le depot git.
set -euo pipefail
$FONCTION_RETOUR
$REMETTRE_BACKEND
if [ "\${1:-}" = --defaire-005 ]; then
  # Le backend de dev tourne sur le code de main : il lit user_audio_sources
  # et rejouerait la 005 en redemarrant. On l'arrete.
  $ARRET_DEV
  # Les liens des seconds importeurs sont perdus (comme avant le correctif).
  # game_rounds.owner_user_id et son index restent : l'ancien code les ignore.
  $PSQL_RETOUR <<'SQL'
SET lock_timeout = '5s';
DROP TRIGGER IF EXISTS audio_sources_lien_proprietaire ON audio_sources;
DROP TRIGGER IF EXISTS audio_sources_lien_retire ON audio_sources;
DROP FUNCTION IF EXISTS audio_sources_lien_proprietaire();
DROP FUNCTION IF EXISTS audio_sources_lien_retire();
DROP TABLE IF EXISTS user_audio_sources;
SQL
  echo "005 defaite (declencheurs, fonctions, table)"
fi
EOF
chmod 700 "$RETOUR_FICHIER" )
RETOUR="bash $RETOUR_FICHIER"
echo "  base    : $DUMP ($(du -h "$DUMP" | cut -f1), mode 600)"
echo "  retour  : $RETOUR"
echo "  journal : $JOURNAL"
trap 'echo "  RETOUR ARRIERE : $RETOUR"' ERR

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
appliquer_005 || die "la 005 a echoue : l'ancien backend tourne toujours, rien d'autre n'a change. Lire l'erreur ci-dessus"
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
n_orph="$(orphelins)"
[ "$n_orph" = 0 ] || die "$n_orph morceau(x) lie(s) a un premier importeur sans son lien dans user_audio_sources"
liens="$(sql "SELECT count(*) FROM user_audio_sources")"
lies_apres="$(sql "SELECT count(*) FROM audio_sources WHERE user_id IS NOT NULL")"
[ "$liens" -ge "$lies_apres" ] || die "user_audio_sources a $liens liens pour $lies_apres morceaux lies"
[ "$(sql "SELECT count(DISTINCT user_id) FROM user_audio_sources")" -ge "$(sql "SELECT count(DISTINCT user_id) FROM audio_sources WHERE user_id IS NOT NULL")" ] \
  || die "des joueurs ont des morceaux sans aucun lien"
[ "$(sql "SELECT count(*) FROM user_audio_sources ua JOIN imported_links il ON il.id = ua.link_id WHERE il.user_id <> ua.user_id")" = 0 ] \
  || die "des liens pointent vers la carte d'un autre joueur"
echo "  [ok] $liens liens pour $lies_apres morceaux lies ($lies_avant avant la 005), 0 orphelin, cartes coherentes (rien a annuler : l'ancien backend tourne avec)"

echo "── 5. Backend ($(heure)) ──"
if [ "$CIBLE" = prod ]; then
  docker compose build backend || die "build du backend en echec : rien n'est redemarre (la 005 reste, sans effet sur l'ancien backend)"
  git fetch -q origin
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
    || die "main a bouge pendant le build : rien n'est redemarre (la 005 reste, sans effet sur l'ancien backend). Mettre /opt/blindify a jour, refaire la campagne et relancer"
fi
# Le build prend des minutes : une partie a pu commencer entre-temps.
for i in $(seq 1 40); do
  n="$(en_cours)"
  [ "$n" = 0 ] && break
  [ "${FORCE:-0}" = 1 ] && { echo "  FORCE=1 : $n partie(s) en cours seront terminees"; break; }
  [ "$i" = 40 ] && die "$n partie(s) en cours apres 20 min : rien n'est redemarre (la 005 reste, sans effet sur l'ancien backend). Relancer plus tard"
  echo "  $n partie(s) en cours, on attend 30 s"; sleep 30
done
retour_backend_auto() {
  echo "  !! $1 : retour automatique au backend d'avant"
  $REMETTRE_BACKEND || true
  echo "  backend d'avant remis (la 005 reste). Verifier $SANTE. Retour complet : $RETOUR"
  exit 1
}
debut=$(date +%s)
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
if [ "$CIBLE" = prod ]; then
  for i in $(seq 1 30); do
    etat="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo inconnu)"
    [ "$etat" = healthy ] && { echo "  [ok] backend healthy (controle docker)"; break; }
    [ "$etat" = unhealthy ] && retour_backend_auto "backend unhealthy"
    sleep 10
    [ "$i" = 30 ] && retour_backend_auto "backend jamais healthy en 5 min"
  done
fi

echo "── 6. Verifications du backend ($(heure)) ──"
sleep 3
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
# Marqueurs choisis absents de la prod d'avant : des fichiers et des noms
# nouveaux du lot (tsc garde les noms et les chaines).
if [ "$CIBLE" = prod ]; then
  dans_code() { docker exec blindify-backend grep -qF -- "$2" "/app/dist/$1.js"; }
  fichier_code() { docker exec blindify-backend test -f "/app/$1"; }
else
  dans_code() { grep -qF -- "$2" "$PILE_WT/backend/src/$1.ts"; }
  fichier_code() { test -f "$PILE_WT/backend/$(echo "$1" | sed -e 's#^dist/#src/#' -e 's#\.js$#.ts#')"; }
fi
code_socket() { curl -s -o /dev/null -w '%{http_code}' -m 15 "$BASE_URL/socket.io/?EIO=4&transport=polling" -H "Origin: $1"; }
verifie "API en ligne" "curl -sf -m 15 $SANTE >/dev/null"
verifie "#54 migration 005 rejouee au demarrage" "dans_code index ensureUserTracksSchema && dans_code services/userTracks user_audio_sources"
verifie "#54 le fichier de la 005 est dans l'image" "fichier_code migrations/005_user_audio_sources.sql"
verifie "#67 complement de manches" "dans_code services/roundTopUp topUpPlayable && dans_code controllers/roomsController requestedRounds"
verifie "#64 recherche stricte et ISRC" "dans_code services/previewMatch parseTitle && dans_code services/deezerPreviewService 'isrc:'"
verifie "#64 rattrapage ISRC dans l'image" "fichier_code $RATTRAPAGE_DIST"
verifie "toujours 0 orphelin apres le demarrage du nouveau backend" "[ \"\$(orphelins)\" = 0 ]"
verifie "socket depuis $ORIGINE accepte (200)" "[ \"\$(code_socket $ORIGINE)\" = 200 ]"
verifie "socket depuis une origine etrangere refuse (403)" "[ \"\$(code_socket https://evil.example)\" = 403 ]"
# Le solo par lien, comme la sonde : aucun compte, rien n'est ecrit en base.
solo="$(curl -s -m 90 -X POST "$BASE_URL/api/quick-play" -H 'Content-Type: application/json' -H "Origin: $ORIGINE" \
  -d '{"url":"https://www.deezer.com/fr/playlist/1109890291","count":10}' || true)"
titres_solo="$(echo "$solo" | jq -r 'if .success == true then [.data.tracks[]? | select(.audio_url != null)] | length else 0 end' 2>/dev/null || echo 0)"
verifie "solo par lien : une playlist Deezer publique donne $titres_solo titres jouables (5 au moins)" "[ \"${titres_solo:-0}\" -ge 5 ]"
[ "$ko" = 0 ] || die "UNE VERIFICATION DU BACKEND A ECHOUE : voir ci-dessus"

echo "── 7. Rattrapage des ISRC ($(heure)) ──"
# Independant du reste : un echec ici ne remet PAS le backend d'avant. Le
# script est reprenable (il ne prend que les morceaux encore sans ISRC).
RATTRAPAGE_OK=1
sans_isrc() { sql "SELECT count(*) FROM audio_sources WHERE provider = 'spotify' AND metadata->>'isrc' IS NULL"; }
rattrapage() { # [--ecrire]
  if [ "$CIBLE" = prod ]; then
    docker exec blindify-backend timeout 900 node "$RATTRAPAGE_DIST" "$@"
  else
    # La pile n'a pas Internet (no-egress) : l'appel a Spotify y echoue, ce
    # qui exerce le chemin d'echec. Config de la pile, jamais affichee.
    ( cd "$PILE_WT/backend" && set -a && . "$PILE_RUN/run/backend.env" && set +a \
      && timeout 900 "$PILE_NODE" -r /opt/blindify/tools/test-stack/no-egress.cjs node_modules/ts-node/dist/bin.js --transpile-only \
        "${RATTRAPAGE_SRC#backend/}" "$@" )
  fi
}
echo "  morceaux Spotify sans ISRC avant : $(sans_isrc)"
echo "  essai (rien n'est ecrit) :"
if rattrapage 2>&1 | sed 's/^/    /'; [ "${PIPESTATUS[0]}" = 0 ]; then
  echo "  ecriture :"
  if rattrapage --ecrire 2>&1 | sed 's/^/    /'; [ "${PIPESTATUS[0]}" = 0 ]; then
    echo "  [ok] rattrapage termine ; morceaux Spotify sans ISRC apres : $(sans_isrc)"
  else
    RATTRAPAGE_OK=0
    echo "  !! rattrapage en ecriture en echec ou incomplet (voir ci-dessus) ; deja ecrit : garde. Sans ISRC : $(sans_isrc)"
  fi
else
  RATTRAPAGE_OK=0
  echo "  !! essai du rattrapage en echec : rien n'est ecrit, on ne lance pas l'ecriture"
fi
[ "$RATTRAPAGE_OK" = 1 ] || echo "  (le backend du lot reste en place ; relancer plus tard : docker exec blindify-backend node $RATTRAPAGE_DIST puis --ecrire)"

if [ "$CIBLE" = pile ]; then
  echo "── 8 et 9. Front, explorateur et backend de dev : pas sur la pile ──"
  echo "ESSAI SUR LA PILE TERMINE ($(git rev-parse --short HEAD)). Rattrapage : $([ "$RATTRAPAGE_OK" = 1 ] && echo ok || echo ECHEC). Retour : $RETOUR"
  [ "$RATTRAPAGE_OK" = 1 ] || exit 3
  exit 0
fi

echo "── 8. Front (voie rapide, $(heure)) ──"
# Texte de l'accueil : go-prod-front.sh le cherche dans la page d'accueil, ou
# le message de #67 n'est pas (il est dans le code de l'ecran de jeu). On lui
# passe un texte present et on prouve le message de #67 dans les chunks servis.
echo "  parties en cours juste avant le front : $(en_cours) (le front est reconstruit en place : quelques secondes de 404 sur les pages)"
AVANT_FRONT="$(ls -dt /opt/backups/front-out-avant-* 2>/dev/null | head -1 || true)"
if ! ( umask 022; bash scripts/go-prod-front.sh "titre-fin" ); then
  NOUVEAU="$(ls -dt /opt/backups/front-out-avant-* 2>/dev/null | head -1 || true)"
  if [ ! -f frontend/out/index.html ] && [ -n "$NOUVEAU" ] && [ "$NOUVEAU" != "$AVANT_FRONT" ]; then
    rsync -a --delete "$NOUVEAU"/ frontend/out/ && echo "  front d'avant remis depuis $NOUVEAU (le build avait vide out/)"
  fi
  echo "  !! FRONT ECHOUE. Le backend du lot est DEJA en place et sain : ne pas le remettre pour ca."
  echo "     Corriger puis relancer : heavy bash /opt/blindify/scripts/go-prod-front.sh titre-fin ; puis l'etape 9 a la main"
  echo "     (systemctl restart blindz-db-browser ; systemctl start blindify-dev-backend). Retour complet si besoin : $RETOUR"
  exit 1
fi
FRONT_SAUVE="$(ls -dt /opt/backups/front-out-avant-* 2>/dev/null | head -1 || true)"
echo "# Front d'avant, si besoin (pas necessaire pour l'ancien backend) : rsync -a --delete $FRONT_SAUVE/ /opt/blindify/frontend/out/" >> "$RETOUR_FICHIER"
build_id="$(find frontend/out/_next/static -mindepth 1 -maxdepth 1 -type d ! -name chunks ! -name css ! -name media -printf '%f\n' | head -1)"
[ -n "$build_id" ] || die "build id introuvable dans frontend/out"
chunk67="$(grep -rlF 'pas assez de titres jouables dans vos playlists' frontend/out/_next/static/chunks | head -1 || true)"
ko=0
verifie "la prod sert le build qui vient d'etre construit ($build_id)" "curl -s -m 30 https://blindz.app/ | grep -qF -e \"$build_id\""
verifie "#67 message « X manches au lieu de Y » dans le build" "[ -n \"$chunk67\" ]"
verifie "#67 blindz.app sert ce fichier" "curl -sf -m 30 \"https://blindz.app/${chunk67#frontend/out/}\" | grep -qF 'pas assez de titres jouables'"
[ "$ko" = 0 ] || { echo "  !! UNE VERIFICATION DU FRONT A ECHOUE (backend en place et sain)"; echo "  front d'avant : rsync -a --delete $FRONT_SAUVE/ /opt/blindify/frontend/out/"; exit 1; }

echo "── 9. Explorateur de base et backend de dev ($(heure)) ──"
trap 'echo "  EXPLORATEUR/DEV SEULEMENT : le jeu est en place ; systemctl restart blindz-db-browser ; systemctl start blindify-dev-backend"' ERR
# L'explorateur lit game_rounds.owner_user_id depuis #54 : on le relance
# maintenant que la colonne existe (jusqu'ici il tournait sur l'ancien code).
systemctl restart blindz-db-browser
derniere="$(sql "SELECT COALESCE(max(session_id), 0) FROM game_rounds")"
for i in $(seq 1 15); do curl -sf -m 3 "http://127.0.0.1:3101/session/$derniere" >/dev/null && break; sleep 2; done
ko=0
verifie "explorateur de base actif" "systemctl is-active --quiet blindz-db-browser"
verifie "explorateur : detail de la derniere partie ($derniere) lisible" "curl -sf -m 10 http://127.0.0.1:3101/session/$derniere | grep -qF '\"manches\"'"
echo "  parties en cours avant le demarrage du backend de dev : $(en_cours)"
systemctl start blindify-dev-backend
for i in $(seq 1 60); do curl -sf -m 2 http://127.0.0.1:3097/api/health >/dev/null && break; sleep 2; done
verifie "backend de dev reparti (meme commit : il tourne depuis /opt/blindify)" "curl -sf -m 5 http://127.0.0.1:3097/api/health >/dev/null"
[ "$ko" = 0 ] || { echo "  !! UNE VERIFICATION DE L'EXPLORATEUR OU DU DEV A ECHOUE (la prod du jeu est en place)"; exit 1; }
trap - ERR

echo
echo "DEPLOIEMENT DU LOT IMPORTEUR TERMINE ($(git rev-parse --short HEAD), $(heure))"
echo "  fait    : 005 en base ($(sql "SELECT count(*) FROM user_audio_sources") liens), backend #54 #67 #64, front #67, explorateur, backend de dev"
echo "  ISRC    : $([ "$RATTRAPAGE_OK" = 1 ] && echo "rattrapage fait, $(sans_isrc) morceaux Spotify encore sans ISRC" || echo "RATTRAPAGE EN ECHEC, a relancer (voir etape 7)")"
echo "  retour  : $RETOUR   (--defaire-005 pour retirer aussi la 005)"
echo "  journal : $JOURNAL"
echo "A faire ensuite :"
echo "  - bash tools/schema-snapshot.sh puis une PR pour backend/db/schema.sql (table user_audio_sources, colonne owner_user_id)"
echo "  - effacer les copies de config une fois tout valide : $SAUVE/env-*-avant-importeur-$HORO"
echo "  - parcours complets sur blindz.app, un a la fois :"
echo "      cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "      cd /opt/blindify/tools && heavy node party-4-joueurs.mjs prod"
[ "$RATTRAPAGE_OK" = 1 ] || exit 3
