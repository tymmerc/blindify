#!/bin/bash
# Mise en prod du lot « jeu » du 05/10/2026. GO de Tym le 05/10 (outil de
# questions) : « par lots », le site d'abord (fait a 20:38 et 21:43 UTC), puis
# le jeu en un seul passage, apres une campagne verte sur le main fusionne,
# a une heure sans partie en cours.
#
#   heavy bash /opt/blindify/scripts/go-prod-2026-10-05-jeu.sh SHA_TESTE_SUR_LA_PILE
#
# SHA_TESTE : le commit de main sur lequel la campagne de la pile est verte.
# main peut l'avoir depasse SEULEMENT par des fichiers de scripts/ (ce script
# lui-meme) ; tout autre ecart arrete le script avant le moindre changement.
#
# Ce qui part :
#   #47 entree en salle : delai et relance du join, join rejouable, plus de
#       double connexion du socket (bug Safari « Preparation du lobby »)
#   #36 grace de 5 s apres une coupure reseau avant la revelation anticipee
#   #52 game:sync reserve aux membres ; resultats ecrits quand le filet
#       anti-AFK finit la partie ; plus de double comptage d'XP
#   #48 statistiques (chiffres de jeu sans les comptes de test, page admin)
#   #38 retours de fin de partie : migration 004 (table game_feedback), route
#       POST /api/feedback, bloc de fin de partie, onglet Retours de l'admin
#   #55 anti-triche : la reponse du lancement ne donne plus a l'hote les titres
#       et artistes de toutes les manches (seulement numero et type)
#   + les mises a jour de dependances deja sur main (pg 8.23.1, socket.io
#     4.8.4, front : React 19.3...), testees par la campagne
#   + retrait de E2E_BYPASS_KEY de la prod et du backend de dev (decision de
#     Tym : la cle est consideree comme exposee, la prod n'en a pas besoin)
# Ne part PAS : #54 (premier importeur, migration 005) : le script s'arrete
# s'il le trouve dans main.
#
# Ordre : verifs du code source (rien ne change encore), sauvegardes
# verifiees, migration (additive), cle E2E, backend (avec retour automatique
# s'il ne demarre pas), verifications, front (voie rapide), admin, backend de
# dev. Redemarrer le backend TERMINE les parties en cours (leur etat ne vit
# qu'en memoire) : le script attend qu'il n'y en ait aucune (FORCE=1 pour
# passer outre). Lancer juste apres un passage de la surveillance
# (blindz-uptime, toutes les 5 min) pour eviter une fausse alerte.
#
# Relu par trois agents le 05/10 (retour arriere, verifications, risque pour
# les joueurs) ; leurs corrections sont appliquees.
#
# Retour arriere : le fichier /opt/backups/retour-jeu-<horodatage>.sh ecrit a
# l'etape 0 (et affiche). Il ne remet PAS la cle E2E (exposee) et ne deplace
# pas le depot git.
set -euo pipefail
cd /opt/blindify
HORO="$(date +%Y%m%d-%H%M%S)"
TESTE="${1:?usage : go-prod-2026-10-05-jeu.sh SHA_TESTE_SUR_LA_PILE}"
JOURNAL="/opt/backups/go-prod-jeu-$HORO.log"
umask 077
# Tout ce qui s'affiche part aussi dans un journal (une coupure SSH ou un arret
# brutal laisse une trace). Aucun secret n'est jamais affiche.
exec > >(tee -a "$JOURNAL") 2>&1
RETOUR="(pas encore de changement)"
die() { echo "  !! $1"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }

echo "── 0. Garde-fous (rien ne change pendant cette etape) ──"
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "le dossier n'est pas sur origin/main : la prod se deploie depuis main"
TESTE_SHA="$(git rev-parse --verify "$TESTE^{commit}")" || die "commit teste inconnu : $TESTE"
git merge-base --is-ancestor "$TESTE_SHA" HEAD || die "le commit teste n'est pas un ancetre de main"
hors_scripts="$(git diff --name-only "$TESTE_SHA" HEAD | grep -v '^scripts/' || true)"
[ -z "$hors_scripts" ] || die "main a change depuis le commit teste ailleurs que dans scripts/ : $hors_scripts"
[ -z "$(git status --short backend/ frontend/ tools/ infra/ scripts/ docker-compose.yml | grep -v '^??' || true)" ] \
  || die "modifications non commitees dans backend/, frontend/, tools/, infra/, scripts/ ou docker-compose.yml"
[ -z "$(git status --short --untracked-files=all backend/src backend/migrations backend/package.json backend/package-lock.json)" ] \
  || die "fichiers non suivis ou modifies dans le backend (ils partiraient dans l'image)"
# Le lot, et rien que le lot.
for f in backend/migrations/004_game_feedback.sql infra/blindz-admin/index.html scripts/go-prod-front.sh; do
  [ -f "$f" ] || die "$f absent : ce n'est pas le main attendu"
done
ls backend/migrations | grep -vqE '^(00[1-4]_[a-z_]+)\.sql$' && die "migration hors lot dans backend/migrations : $(ls backend/migrations | tr '\n' ' ')"
grep -rqs ensureUserTracksSchema backend/src && die "#54 (migration 005) est dans ce main : hors lot"
present() { grep -rqF -- "$1" "$2" || die "main incomplet : « $1 » absent de $2"; }
present DISCONNECT_GRACE_MS backend/src/services/realtimeGame.ts                 # 36
present 'game:sync DENIED' backend/src/socketHandlers.ts                         # 52
present 'COALESCE(EXCLUDED.nickname' backend/src/controllers/roomsController.ts  # 47
present 'abouti a temps' frontend/src/lib/withTimeoutRetry.ts                    # 47
present 't-retours' infra/blindz-admin/index.html                                # 38
present 'orphelin' infra/blindz-admin/index.html                                 # 48
present 'visites' infra/blindz-admin/index.html                                  # 48
present 'hiddenTrackRow' backend/src/controllers/roomsController.ts              # 55
echo "  commit deploye : $(git rev-parse --short HEAD) (main ; campagne verte sur ${TESTE_SHA:0:7})"
precedent="$(ls -t /opt/backups/env-prod-avant-* 2>/dev/null | head -1 || true)"
[ -n "$precedent" ] && echo "  NOTE : sauvegarde de config precedente trouvee ($precedent). En cas de relance apres un echec, le vrai retour arriere est celui du PREMIER passage."

psql_prod() { docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 -qAt "$@"; }
# Parties vivantes : le filtre garde les salles zombies (24 h et plus) hors du
# compte, mais couvre une longue soiree ou un streamer (30 manches de 60 s).
en_cours() { psql_prod -c "SELECT count(*) FROM multiplayer_rooms WHERE status = 'in_progress' AND COALESCE(started_at, created_at) > now() - interval '3 hours'"; }

echo "── 1. Sauvegardes (verifiees avant tout changement) ──"
DUMP="/opt/backups/avant-deploy-$HORO.sql.gz"
if ! { docker exec blindify-postgres pg_dump -U blindify -d blindify | gzip > "$DUMP"; } \
  || ! gzip -t "$DUMP" || ! zcat "$DUMP" | tail -n 5 | grep >/dev/null 'PostgreSQL database dump complete'; then
  rm -f "$DUMP"; die "sauvegarde de la base invalide"
fi
# L'image qui tourne VRAIMENT, pas forcement celle taguee latest.
docker tag "$(docker inspect -f '{{.Image}}' blindify-backend)" "blindify-backend:avant-$HORO"
cp -a .env "/opt/backups/env-prod-avant-$HORO"
cp -a .env.dev-backend "/opt/backups/env-dev-backend-avant-$HORO"
cp -a /opt/dev/blindz/index.html "/opt/backups/blindz-admin-index.html-avant-jeu-$HORO"
cmp -s "/opt/backups/env-prod-avant-$HORO" .env && cmp -s "/opt/backups/env-dev-backend-avant-$HORO" .env.dev-backend \
  && cmp -s "/opt/backups/blindz-admin-index.html-avant-jeu-$HORO" /opt/dev/blindz/index.html \
  || die "copie de sauvegarde differente de l'original"
RETOUR_FICHIER="/opt/backups/retour-jeu-$HORO.sh"
cat > "$RETOUR_FICHIER" <<EOF
#!/bin/bash
# Retour arriere du lot jeu du $HORO (ecrit par go-prod-2026-10-05-jeu.sh).
# Remet l'image du backend et la page admin d'avant. NE remet PAS la cle E2E
# (exposee) : si tu la veux vraiment, cp -a /opt/backups/env-prod-avant-$HORO /opt/blindify/.env
# avant le docker compose. La table game_feedback reste (l'ancien backend
# l'ignore). Ne deplace pas le depot git.
set -euo pipefail
cd /opt/blindify
docker tag blindify-backend:avant-$HORO blindify-backend:latest
docker compose up -d --no-deps backend
cp -a /opt/backups/blindz-admin-index.html-avant-jeu-$HORO /opt/dev/blindz/index.html
systemctl restart blindz-db-browser
# Front : si besoin, rsync -a --delete <dernier /opt/backups/front-out-avant-*>/ /opt/blindify/frontend/out/
# Si le script a ete coupe pendant le build du front : systemctl start blindify-dev-frontend
EOF
chmod 700 "$RETOUR_FICHIER"
RETOUR="bash $RETOUR_FICHIER"
echo "  base    : $DUMP ($(du -h "$DUMP" | cut -f1), mode 600)"
echo "  image   : blindify-backend:avant-$HORO"
echo "  config  : /opt/backups/env-prod-avant-$HORO, /opt/backups/env-dev-backend-avant-$HORO (mode 600)"
echo "  admin   : /opt/backups/blindz-admin-index.html-avant-jeu-$HORO"
echo "  retour  : $RETOUR"
echo "  journal : $JOURNAL"
trap 'echo "  RETOUR ARRIERE : $RETOUR"' ERR

echo "── 2. Migration 004 (table des retours, additive, une seule transaction) ──"
{ echo "SET lock_timeout = '5s';"; cat backend/migrations/004_game_feedback.sql; } | psql_prod -1
[ "$(psql_prod -c "SELECT to_regclass('public.game_feedback') IS NOT NULL")" = t ] || die "table game_feedback absente apres la migration"
[ "$(psql_prod -c "SELECT has_table_privilege('blindz_ro', 'public.game_feedback', 'SELECT')")" = t ] || die "le role de l'admin (blindz_ro) ne lit pas game_feedback"
echo "  [ok] game_feedback creee, lisible par l'admin (rien a annuler : l'ancien backend l'ignore)"

echo "── 3. Cle E2E retiree (prod et backend de dev) ──"
# Jamais de valeur affichee : on ne compte que les lignes.
for f in .env .env.dev-backend; do
  if grep -q '^E2E_BYPASS_KEY=' "$f"; then
    grep -v '^E2E_BYPASS_KEY=' "$f" > "$f.sans-e2e"
    chmod 600 "$f.sans-e2e"; mv "$f.sans-e2e" "$f"
  fi
  [ "$(grep -c '^E2E_BYPASS_KEY=' "$f" || true)" = 0 ] || die "E2E_BYPASS_KEY encore dans $f"
  echo "  [ok] plus de E2E_BYPASS_KEY dans $f"
done

echo "── 4. Backend ──"
docker compose build backend
# Juste avant le redemarrage (le build prend des minutes) : main n'a pas bouge,
# et aucune partie en cours.
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
  || die "main a bouge pendant le build : mettre /opt/blindify a jour, refaire la campagne et relancer (rien n'est encore redemarre)"
for i in $(seq 1 40); do
  n="$(en_cours)"
  [ "$n" = 0 ] && break
  [ "${FORCE:-0}" = 1 ] && { echo "  FORCE=1 : $n partie(s) en cours seront terminees"; break; }
  [ "$i" = 40 ] && die "$n partie(s) toujours en cours apres 20 min : relancer plus tard (ou FORCE=1). Rien n'est redemarre ; la cle E2E est deja retiree des fichiers, sans effet tant que le conteneur n'est pas recree"
  echo "  $n partie(s) en cours, on attend 30 s"; sleep 30
done
retour_backend_auto() {
  echo "  !! $1 : retour automatique a l'image d'avant"
  docker tag "blindify-backend:avant-$HORO" blindify-backend:latest
  docker compose up -d --no-deps backend
  echo "  image d'avant remise ; verifier https://blindz.app/api/health. Retour complet : $RETOUR"
  exit 1
}
debut=$(date +%s)
# up -d recree le conteneur : il prend la nouvelle image ET la config sans la cle E2E.
docker compose up -d --no-deps backend
until curl -sf -m 2 https://blindz.app/api/health >/dev/null; do
  sleep 2
  redemarrages="$(docker inspect -f '{{.RestartCount}}' blindify-backend 2>/dev/null || echo 0)"
  [ "${redemarrages:-0}" -ge 2 ] && retour_backend_auto "le backend redemarre en boucle"
  [ $(( $(date +%s) - debut )) -gt 120 ] && retour_backend_auto "API toujours hors ligne apres 120 s"
done
echo "  API de nouveau en ligne apres $(( $(date +%s) - debut )) s"
for i in $(seq 1 30); do
  etat="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo inconnu)"
  [ "$etat" = healthy ] && { echo "  [ok] backend healthy (controle docker)"; break; }
  [ "$etat" = unhealthy ] && retour_backend_auto "backend unhealthy"
  sleep 10
  [ "$i" = 30 ] && retour_backend_auto "backend jamais healthy en 5 min"
done

echo "── 5. Verifications du backend ──"
sleep 3
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
code_post() { local corps="${3:-}"; [ -n "$corps" ] || corps='{}'; curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST "https://blindz.app$1" -H 'Content-Type: application/json' -H "Origin: $2" -d "$corps"; }
code_socket() { curl -s -o /dev/null -w '%{http_code}' -m 15 "https://blindz.app/socket.io/?EIO=4&transport=polling" -H "Origin: $1"; }
dans_dist() { docker exec blindify-backend grep -rqF -- "$1" /app/dist; }
verifie "API en ligne" "curl -sf -m 15 https://blindz.app/api/health >/dev/null"
verifie "#36 grace de 5 s presente" "dans_dist DISCONNECT_GRACE_MS"
verifie "#52 game:sync reserve aux membres" "dans_dist 'game:sync DENIED'"
verifie "#47 join rejouable (pseudo garde)" "dans_dist 'COALESCE(EXCLUDED.nickname, room_participants.nickname)'"
verifie "#55 lancement sans les titres des manches" "dans_dist hiddenTrackRow"
verifie "#38 route des retours : un corps vide est refuse (400, pas 404)" "[ \"\$(code_post /api/feedback https://blindz.app)\" = 400 ]"
verifie "plus de cle E2E dans le conteneur" "docker exec blindify-backend sh -c 'test -z \"\${E2E_BYPASS_KEY:-}\"'"
verifie "POST depuis blindz.app accepte (404 = route inconnue, origine admise)" "[ \"\$(code_post /api/__controle_origine https://blindz.app)\" = 404 ]"
verifie "POST depuis une origine etrangere refuse (403)" "[ \"\$(code_post /api/__controle_origine https://evil.example)\" = 403 ]"
verifie "POST depuis dev.tymmerc.eu refuse en prod (403)" "[ \"\$(code_post /api/__controle_origine https://dev.tymmerc.eu)\" = 403 ]"
verifie "socket depuis blindz.app accepte (200)" "[ \"\$(code_socket https://blindz.app)\" = 200 ]"
verifie "socket depuis une origine etrangere refuse (403)" "[ \"\$(code_socket https://evil.example)\" = 403 ]"
verifie "plus de .env dans le conteneur" "! docker exec blindify-backend test -e /app/.env"
# Un vrai retour ecrit en base de prod puis efface (marque verif-mep-HORO).
MARQUE="verif-mep-$HORO"
verifie "#38 un vrai retour s'ecrit (201)" "[ \"\$(code_post /api/feedback https://blindz.app '{\"kind\":\"avis\",\"answer\":\"oui\",\"mode\":\"solo\",\"appVersion\":\"$MARQUE\"}')\" = 201 ]"
verifie "#38 ce retour est bien en base" "[ \"\$(psql_prod -c \"SELECT count(*) FROM game_feedback WHERE app_version = '$MARQUE'\")\" = 1 ]"
psql_prod -c "DELETE FROM game_feedback WHERE app_version = '$MARQUE'" >/dev/null || true
[ "$ko" = 0 ] || die "UNE VERIFICATION DU BACKEND A ECHOUE : voir ci-dessus"

echo "── 6. Front (voie rapide) ──"
# go-prod-front.sh garde sa propre sauvegarde du site et affiche son retour
# arriere. Le texte de l'accueil ne change pas dans ce lot : on lui passe un
# texte present, et on prouve la nouvelle version par le build id et les chunks.
echo "  parties en cours juste avant le front : $(en_cours) (le front est reconstruit en place : quelques secondes de 404 sur les pages)"
AVANT_FRONT="$(ls -dt /opt/backups/front-out-avant-* 2>/dev/null | head -1 || true)"
# Le umask 077 de ce script (sauvegardes) ne doit pas passer au build du front :
# le 06/10, il a rendu frontend/out illisible pour nginx (500 pendant 18 s).
if ! ( umask 022; bash scripts/go-prod-front.sh "titre-fin" ); then
  NOUVEAU="$(ls -dt /opt/backups/front-out-avant-* 2>/dev/null | head -1 || true)"
  if [ ! -f frontend/out/index.html ] && [ -n "$NOUVEAU" ] && [ "$NOUVEAU" != "$AVANT_FRONT" ]; then
    rsync -a --delete "$NOUVEAU"/ frontend/out/ && echo "  front d'avant remis depuis $NOUVEAU (le build avait vide out/)"
  fi
  echo "  !! FRONT ECHOUE. Le backend du lot est DEJA en place et sain : ne pas le remettre pour ca."
  echo "     Corriger puis relancer : heavy bash /opt/blindify/scripts/go-prod-front.sh titre-fin ; retour complet si besoin : $RETOUR"
  exit 1
fi
build_id="$(find frontend/out/_next/static -mindepth 1 -maxdepth 1 -type d ! -name chunks ! -name css ! -name media -printf '%f\n' | head -1)"
[ -n "$build_id" ] || die "build id introuvable dans frontend/out"
ko=0
verifie "la prod sert le build qui vient d'etre construit ($build_id)" "curl -s -m 30 https://blindz.app/ | grep -F -e \"$build_id\" >/dev/null"
verifie "#47 delai du join dans le front" "grep -rlF 'abouti a temps' frontend/out/_next/static/chunks >/dev/null"
verifie "#38 bloc de fin de partie dans le front" "grep -rlF 'est bien pass' frontend/out/_next/static/chunks >/dev/null"
[ "$ko" = 0 ] || { echo "  !! UNE VERIFICATION DU FRONT A ECHOUE (backend en place et sain)"; echo "  front d'avant : rsync -a --delete $(ls -dt /opt/backups/front-out-avant-* | head -1)/ /opt/blindify/frontend/out/"; exit 1; }

echo "── 7. Admin et backend de dev ──"
trap 'echo "  ADMIN/DEV SEULEMENT : cp -a /opt/backups/blindz-admin-index.html-avant-jeu-$HORO /opt/dev/blindz/index.html && systemctl restart blindz-db-browser"' ERR
cp infra/blindz-admin/index.html /opt/dev/blindz/index.html.nouveau
chmod 644 /opt/dev/blindz/index.html.nouveau
mv /opt/dev/blindz/index.html.nouveau /opt/dev/blindz/index.html
systemctl restart blindz-db-browser
for i in $(seq 1 15); do curl -sf -m 3 http://127.0.0.1:3101/retours >/dev/null && break; sleep 2; done
ko=0
verifie "explorateur de base actif" "systemctl is-active --quiet blindz-db-browser"
verifie "onglet Retours : la table est vue et lisible" "curl -s -m 10 http://127.0.0.1:3101/retours | grep -F >/dev/null '\"lisible\":true'"
verifie "page admin a jour (onglet Retours, Visites, orphelines)" "grep -qF 'id=\"t-retours\"' /opt/dev/blindz/index.html && grep -qF visites /opt/dev/blindz/index.html && grep -qF orphelin /opt/dev/blindz/index.html"
echo "  parties en cours avant le redemarrage du backend de dev : $(en_cours)"
systemctl restart blindify-dev-backend
for i in $(seq 1 60); do curl -sf -m 2 http://127.0.0.1:3097/api/health >/dev/null && break; sleep 2; done
verifie "backend de dev reparti" "curl -sf -m 5 http://127.0.0.1:3097/api/health >/dev/null"
verifie "backend de dev sans cle E2E" "[ \"\$(tr '\\0' '\\n' < /proc/\$(systemctl show -p MainPID --value blindify-dev-backend)/environ | grep -c '^E2E_BYPASS_KEY=' || true)\" = 0 ]"
[ "$ko" = 0 ] || { echo "  !! UNE VERIFICATION DE L'ADMIN OU DU DEV A ECHOUE (la prod du jeu est en place)"; echo "  admin : cp -a /opt/backups/blindz-admin-index.html-avant-jeu-$HORO /opt/dev/blindz/index.html && systemctl restart blindz-db-browser"; exit 1; }
trap - ERR

echo "DEPLOIEMENT DU LOT JEU TERMINE ($(git rev-parse --short HEAD)). Journal : $JOURNAL"
echo "A faire ensuite :"
echo "  - tools/schema-snapshot.sh puis une PR pour backend/db/schema.sql (nouvelle table)"
echo "  - changer /opt/blindify/.e2e-bypass-key (meme valeur que la cle retiree ; seule la pile de test s'en sert)"
echo "  - effacer les copies de config une fois tout valide : /opt/backups/env-*-avant-$HORO"
echo "  - parcours complets sur blindz.app, un a la fois :"
echo "      cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "      cd /opt/blindify/tools && heavy node party-4-joueurs.mjs prod"
echo "      cd /opt/blindify/tools && heavy node anticheat-e2e.mjs prod   (verifie aussi la reponse du lancement, #55)"
