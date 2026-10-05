#!/bin/bash
# Mise en prod du lot « jeu » du 05/10/2026. GO de Tym le 05/10 (outil de
# questions) : « par lots », le site d'abord (fait a 20:38 et 21:43 UTC), puis
# le jeu en un seul passage, apres une campagne verte sur le main fusionne,
# a une heure sans partie en cours.
#
#   heavy bash /opt/blindify/scripts/go-prod-2026-10-05-jeu.sh SHA_DE_MAIN_TESTE
#
# Le SHA est celui sur lequel la campagne de la pile est verte : le script
# refuse de deployer autre chose.
#
# Ce qui part :
#   #47 entree en salle : delai et relance du join, join rejouable, plus de
#       double connexion du socket (bug Safari « Preparation du lobby »)
#   #36 grace de 5 s apres une coupure reseau avant la revelation anticipee
#   #52 game:sync reserve aux membres de la salle ; resultats ecrits quand le
#       filet anti-AFK finit la partie ; plus de double comptage d'XP
#   #48 statistiques (requete des chiffres de jeu sans les comptes de test)
#   #38 retours de fin de partie : migration 004 (table game_feedback), route
#       POST /api/feedback, bloc de fin de partie, onglet Retours de l'admin
#   + retrait de E2E_BYPASS_KEY de la prod et du backend de dev (decision de
#     Tym : la cle est consideree comme exposee, la prod n'en a pas besoin)
#
# Ordre : sauvegardes, migration (additive : une table de plus, l'ancien
# backend l'ignore), cle E2E, backend, verifications, front (voie rapide),
# admin, backend de dev. Redemarrer le backend TERMINE les parties en cours
# (leur etat ne vit qu'en memoire) : le script attend qu'il n'y en ait aucune
# (FORCE=1 pour passer outre).
#
# Retour arriere : les commandes affichees a l'etape 0.
set -euo pipefail
cd /opt/blindify
HORO="$(date +%Y%m%d-%H%M%S)"
TESTE="${1:?usage : go-prod-2026-10-05-jeu.sh SHA_DE_MAIN_TESTE_SUR_LA_PILE}"

echo "── 0. Garde-fous et sauvegardes ──"
git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "  !! le dossier n'est pas sur origin/main : la prod se deploie depuis main"; exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse --verify "$TESTE^{commit}")" ]; then
  echo "  !! main ($(git rev-parse --short HEAD)) n'est pas le commit teste ($TESTE)"; exit 1
fi
if [ -n "$(git status --short backend/ frontend/ tools/ infra/ | grep -v '^??' || true)" ]; then
  echo "  !! modifications non commitees dans backend/, frontend/, tools/ ou infra/"; exit 1
fi
if [ -n "$(git status --short --untracked-files=all backend/src backend/migrations backend/package.json backend/package-lock.json)" ]; then
  echo "  !! fichiers non suivis ou modifies dans le backend (ils partiraient dans l'image)"; exit 1
fi
for f in backend/migrations/004_game_feedback.sql infra/blindz-admin/index.html scripts/go-prod-front.sh; do
  [ -f "$f" ] || { echo "  !! $f absent : ce n'est pas le main attendu"; exit 1; }
done
echo "  commit deploye : $(git rev-parse --short HEAD) (main, teste sur la pile)"

psql_prod() { docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 -qAt "$@"; }
en_cours() { psql_prod -c "SELECT count(*) FROM multiplayer_rooms WHERE status = 'in_progress' AND started_at > now() - interval '30 minutes'"; }

DUMP="/opt/backups/avant-deploy-$HORO.sql.gz"
docker exec blindify-postgres pg_dump -U blindify -d blindify | gzip > "$DUMP"
gzip -t "$DUMP" && zcat "$DUMP" | tail -n 5 | grep >/dev/null 'PostgreSQL database dump complete' \
  || { echo "  !! sauvegarde de la base invalide : $DUMP"; exit 1; }
# L'image qui tourne VRAIMENT, pas forcement celle taguee latest.
docker tag "$(docker inspect -f '{{.Image}}' blindify-backend)" "blindify-backend:avant-$HORO"
umask 077
cp -a .env "/opt/backups/env-prod-avant-$HORO"
cp -a .env.dev-backend "/opt/backups/env-dev-backend-avant-$HORO"
cp -a /opt/dev/blindz/index.html "/opt/backups/blindz-admin-index.html-avant-jeu-$HORO"
umask 022
for s in "/opt/backups/env-prod-avant-$HORO:.env" "/opt/backups/env-dev-backend-avant-$HORO:.env.dev-backend" "/opt/backups/blindz-admin-index.html-avant-jeu-$HORO:/opt/dev/blindz/index.html"; do
  cmp -s "${s%%:*}" "${s#*:}" || { echo "  !! copie de sauvegarde differente de l'original : ${s%%:*}"; exit 1; }
done
RETOUR="cd /opt/blindify && cp -a /opt/backups/env-prod-avant-$HORO .env && cp -a /opt/backups/env-dev-backend-avant-$HORO .env.dev-backend && docker tag blindify-backend:avant-$HORO blindify-backend:latest && docker compose up -d --no-deps backend && cp -a /opt/backups/blindz-admin-index.html-avant-jeu-$HORO /opt/dev/blindz/index.html && systemctl restart blindify-dev-backend"
RETOUR_BASE="(facultatif, la table est ignoree par l'ancien backend) docker exec -i blindify-postgres psql -U blindify -d blindify -c 'DROP TABLE IF EXISTS game_feedback'"
trap 'echo "  RETOUR ARRIERE : $RETOUR"; echo "  BASE : $RETOUR_BASE"' ERR
echo "  base    : $DUMP ($(du -h "$DUMP" | cut -f1))"
echo "  image   : blindify-backend:avant-$HORO"
echo "  config  : /opt/backups/env-prod-avant-$HORO, /opt/backups/env-dev-backend-avant-$HORO (mode 600)"
echo "  admin   : /opt/backups/blindz-admin-index.html-avant-jeu-$HORO"
echo "  retour  : $RETOUR"
echo "  base    : $RETOUR_BASE"

echo "── 1. Migration 004 (table des retours, additive) ──"
psql_prod < backend/migrations/004_game_feedback.sql
[ "$(psql_prod -c "SELECT to_regclass('public.game_feedback') IS NOT NULL")" = t ] \
  || { echo "  !! table game_feedback absente apres la migration"; exit 1; }
[ "$(psql_prod -c "SELECT has_table_privilege('blindz_ro', 'public.game_feedback', 'SELECT')")" = t ] \
  || { echo "  !! le role de l'admin (blindz_ro) ne lit pas game_feedback"; exit 1; }
echo "  [ok] game_feedback creee, lisible par l'admin"

echo "── 2. Cle E2E retiree (prod et backend de dev) ──"
# Jamais de valeur affichee : on ne compte que les lignes.
for f in .env .env.dev-backend; do
  if grep -q '^E2E_BYPASS_KEY=' "$f"; then
    umask 077; grep -v '^E2E_BYPASS_KEY=' "$f" > "$f.sans-e2e"; umask 022
    chmod 600 "$f.sans-e2e"; mv "$f.sans-e2e" "$f"
  fi
  [ "$(grep -c '^E2E_BYPASS_KEY=' "$f" || true)" = 0 ] || { echo "  !! E2E_BYPASS_KEY encore dans $f"; exit 1; }
  echo "  [ok] plus de E2E_BYPASS_KEY dans $f"
done

echo "── 3. Backend ──"
docker compose build backend
# Juste avant le redemarrage (le build prend des minutes) : aucune partie en cours.
for i in $(seq 1 40); do
  n="$(en_cours)"
  [ "$n" = 0 ] && break
  [ "${FORCE:-0}" = 1 ] && { echo "  FORCE=1 : $n partie(s) en cours seront terminees"; break; }
  [ "$i" = 40 ] && { echo "  !! $n partie(s) toujours en cours apres 20 min : relancer plus tard (ou FORCE=1)"; echo "  RETOUR ARRIERE (config seulement, rien d'autre n'a change) : cp -a /opt/backups/env-prod-avant-$HORO /opt/blindify/.env && cp -a /opt/backups/env-dev-backend-avant-$HORO /opt/blindify/.env.dev-backend"; exit 1; }
  echo "  $n partie(s) en cours, on attend 30 s"; sleep 30
done
debut=$(date +%s)
# up -d recree le conteneur : il prend la nouvelle image ET la config sans la cle E2E.
docker compose up -d --no-deps backend
until curl -sf -m 2 https://blindz.app/api/health >/dev/null; do
  sleep 1; [ $(( $(date +%s) - debut )) -gt 120 ] && break
done
echo "  API de nouveau en ligne apres $(( $(date +%s) - debut )) s"
for i in $(seq 1 30); do
  etat="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo inconnu)"
  [ "$etat" = "healthy" ] && { echo "  [ok] backend healthy (controle docker)"; break; }
  sleep 10
  [ "$i" = "30" ] && { echo "  !! backend jamais healthy, voir docker logs blindify-backend"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }
done

echo "── 4. Verifications du backend ──"
sleep 3
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
code_post() { curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST "https://blindz.app$1" -H 'Content-Type: application/json' -H "Origin: $2" -d '{}'; }
code_socket() { curl -s -o /dev/null -w '%{http_code}' -m 15 "https://blindz.app/socket.io/?EIO=4&transport=polling" -H "Origin: $1"; }
dans_dist() { docker exec blindify-backend grep -rqF "$1" /app/dist; }
verifie "API en ligne" "curl -sf -m 15 https://blindz.app/api/health >/dev/null"
verifie "#36 grace de 5 s presente" "dans_dist DISCONNECT_GRACE_MS"
verifie "#52 game:sync reserve aux membres" "dans_dist 'game:sync DENIED'"
verifie "#47 join rejouable" "dans_dist rejoined"
verifie "#38 route des retours : un corps vide est refuse (400, pas 404)" "[ \"\$(code_post /api/feedback https://blindz.app)\" = 400 ]"
verifie "#38 route des retours fermee aux origines etrangeres (403)" "[ \"\$(code_post /api/feedback https://evil.example)\" = 403 ]"
verifie "plus de cle E2E dans le conteneur" "docker exec blindify-backend sh -c 'test -z \"\${E2E_BYPASS_KEY:-}\"'"
verifie "POST depuis une origine etrangere refuse (403)" "[ \"\$(code_post /api/__controle_origine https://evil.example)\" = 403 ]"
verifie "socket depuis blindz.app accepte (200)" "[ \"\$(code_socket https://blindz.app)\" = 200 ]"
verifie "socket depuis une origine etrangere refuse (403)" "[ \"\$(code_socket https://evil.example)\" = 403 ]"
verifie "plus de .env dans le conteneur" "! docker exec blindify-backend test -e /app/.env"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION DU BACKEND A ECHOUE : voir ci-dessus"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }

echo "── 5. Front (voie rapide) ──"
# go-prod-front.sh garde sa propre sauvegarde du site et affiche son retour
# arriere. Le texte de l'accueil ne change pas dans ce lot : on lui passe un
# texte present, et on prouve la nouvelle version par les chunks et le build id.
trap - ERR
bash scripts/go-prod-front.sh "titre-fin"
trap 'echo "  RETOUR ARRIERE : $RETOUR"; echo "  BASE : $RETOUR_BASE"' ERR
build_id="$(find frontend/out/_next/static -mindepth 1 -maxdepth 1 -type d ! -name chunks ! -name css ! -name media -printf '%f\n' | head -1)"
ko=0
verifie "la prod sert le build qui vient d'etre construit ($build_id)" "curl -s -m 30 https://blindz.app/ | grep -F >/dev/null \"$build_id\""
verifie "#47 bouton Retour au menu dans le front" "grep -rlF 'Retour au menu' frontend/out/_next/static/chunks >/dev/null"
verifie "#38 bloc de fin de partie dans le front" "grep -rlF 'est bien pass' frontend/out/_next/static/chunks >/dev/null"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION DU FRONT A ECHOUE"; echo "  RETOUR ARRIERE : $RETOUR (et la commande rsync affichee par go-prod-front.sh)"; exit 1; }

echo "── 6. Admin et backend de dev ──"
cp infra/blindz-admin/index.html /opt/dev/blindz/index.html
systemctl restart blindz-db-browser
sleep 2
ko=0
verifie "explorateur de base actif" "systemctl is-active --quiet blindz-db-browser"
verifie "onglet Retours : la table est vue" "curl -s -m 10 http://127.0.0.1:3101/retours | grep -F >/dev/null '\"table\":true'"
verifie "page admin a jour (onglet Retours, lien Visites, orphelines)" "grep -qF 'Retours' /opt/dev/blindz/index.html && grep -qF 'visites' /opt/dev/blindz/index.html && grep -qF 'orphelin' /opt/dev/blindz/index.html"
systemctl restart blindify-dev-backend
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3097/api/health >/dev/null && break; sleep 2; done
verifie "backend de dev reparti (sans cle E2E)" "curl -sf -m 5 http://127.0.0.1:3097/api/health >/dev/null"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION DE L'ADMIN OU DU DEV A ECHOUE (la prod du jeu est en place)"; echo "  admin : cp -a /opt/backups/blindz-admin-index.html-avant-jeu-$HORO /opt/dev/blindz/index.html && systemctl restart blindz-db-browser"; exit 1; }

echo "DEPLOIEMENT DU LOT JEU TERMINE ($(git rev-parse --short HEAD))."
echo "A faire ensuite : tools/schema-snapshot.sh puis une PR pour backend/db/schema.sql (nouvelle table)."
echo "Parcours complets sur blindz.app, un a la fois :"
echo "  cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "  cd /opt/blindify/tools && heavy node party-4-joueurs.mjs prod"
echo "  cd /opt/blindify/tools && heavy node anticheat-e2e.mjs prod"
