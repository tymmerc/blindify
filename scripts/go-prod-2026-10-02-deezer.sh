#!/bin/bash
# Mise en prod du correctif de recherche Deezer du 02/10/2026 (PR #23), solo par
# lien casse : la recherche avancee de Deezer renvoie 0 resultat depuis ce jour.
# GO de Tym le 02/10 vers 12:00 : « des la CI verte » (la pile de test utilise un
# faux Deezer, elle ne verrait pas ce bug). A lancer via heavy,
# sans campagne prealable sur la pile :
#
#   heavy bash /opt/blindify/scripts/go-prod-2026-10-02-deezer.sh
#
# BACKEND SEULEMENT. L'etat des parties ne vit qu'en memoire : redemarrer le
# backend TERMINE les parties en cours (game:lost chez les joueurs, scores non
# ecrits) et coupe le service une quinzaine de secondes. Le script attend donc
# qu'aucune partie ne soit en cours juste avant de redemarrer (FORCE=1 pour
# passer outre), et se lance de preference a une heure creuse.
#   - les reponses d'une manche sont copiees a la revelation avant d'etre
#     ecrites (avant : perdues, ou remplacees par la manche suivante) ;
#   - la revelation declenchee par une deconnexion ecrit enfin les reponses et
#     pose le filet anti-AFK (finishEarlyReveal, commun aux deux chemins) ;
#   - le filet anti-AFK ne lance jamais une manche pendant une pause.
# Le front ne change pas depuis la prod (cee54f7 -> a83af17 : seulement
# frontend/.lintstagedrc.json, qui n'est pas livre) : pas de next build.
# Relu par trois agents (retour arriere, verifications, risque joueurs) avant
# le premier lancement.
#
# Retour arriere : la commande affichee a l'etape 0.
set -euo pipefail
cd /opt/blindify
HORO="$(date +%Y%m%d-%H%M%S)"

echo "── 0. Garde-fous et sauvegardes ──"
git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "  !! le dossier n'est pas sur origin/main : la prod se deploie depuis main"; exit 1
fi
if [ -n "$(git status --short backend/ frontend/ tools/ | grep -v '^??')" ]; then
  echo "  !! modifications non commitees dans backend/, frontend/ ou tools/"; exit 1
fi
if [ -n "$(git status --short --untracked-files=all backend/src backend/package.json backend/package-lock.json)" ]; then
  echo "  !! fichiers non suivis ou modifies dans le backend (ils partiraient dans l'image)"; exit 1
fi
# Liste noire plutot que blanche : tout fichier du front qui change fait echouer,
# sauf ce qui n'est jamais livre dans l'export statique.
if [ -n "$(git diff --name-only cee54f7 HEAD -- frontend ':(exclude)frontend/e2e' ':(exclude)frontend/.lintstagedrc.json' ':(exclude)frontend/README.md' ':(exclude)frontend/playwright.config.ts' ':(exclude)frontend/vitest.config.ts' ':(exclude)frontend/src/**/*.test.ts' ':(exclude)frontend/src/**/*.test.tsx')" ]; then
  echo "  !! le front a change depuis la prod : ce script ne reconstruit pas le front"; exit 1
fi
echo "  commit deploye : $(git rev-parse --short HEAD) (main)"
en_cours() { docker exec blindify-postgres psql -U blindify -d blindify -qAt -c \
  "SELECT count(*) FROM multiplayer_rooms WHERE status = 'in_progress' AND started_at > now() - interval '30 minutes'"; }
DUMP="/opt/backups/avant-deploy-$HORO.sql.gz"
docker exec blindify-postgres pg_dump -U blindify -d blindify | gzip > "$DUMP"
gzip -t "$DUMP" && zcat "$DUMP" | tail -n 5 | grep -q 'PostgreSQL database dump complete' \
  || { echo "  !! sauvegarde de la base invalide : $DUMP"; exit 1; }
# L'image qui tourne VRAIMENT, pas forcement celle taguee latest.
docker tag "$(docker inspect -f '{{.Image}}' blindify-backend)" "blindify-backend:avant-$HORO"
RETOUR="cd /opt/blindify && docker tag blindify-backend:avant-$HORO blindify-backend:latest && docker compose up -d --no-deps backend"
trap 'echo "  RETOUR ARRIERE : $RETOUR"' ERR
echo "  base    : $DUMP ($(du -h "$DUMP" | cut -f1))"
echo "  image   : blindify-backend:avant-$HORO (sans .env)"
echo "  retour backend : $RETOUR"

echo "── 1. Backend ──"
docker compose build backend
# Juste avant le redemarrage (le build prend des minutes) : aucune partie en cours.
for i in $(seq 1 40); do
  n="$(en_cours)"
  [ "$n" = 0 ] && break
  [ "${FORCE:-0}" = 1 ] && { echo "  FORCE=1 : $n partie(s) en cours seront terminees"; break; }
  [ "$i" = 40 ] && { echo "  !! $n partie(s) toujours en cours apres 20 min : relancer plus tard (ou FORCE=1)"; exit 1; }
  echo "  $n partie(s) en cours, on attend 30 s"; sleep 30
done
debut=$(date +%s)
docker compose up -d --no-deps backend
until curl -sf -m 2 https://blindz.app/api/health >/dev/null; do
  sleep 1; [ $(( $(date +%s) - debut )) -gt 120 ] && break
done
echo "  API de nouveau en ligne apres $(( $(date +%s) - debut )) s"
for i in $(seq 1 30); do
  etat="$(docker inspect -f '{{.State.Health.Status}}' blindify-backend 2>/dev/null || echo inconnu)"
  [ "$etat" = "healthy" ] && { echo "  [ok] backend healthy (controle docker, toutes les 30 s)"; break; }
  sleep 10
  [ "$i" = "30" ] && { echo "  !! backend jamais healthy, voir docker logs blindify-backend"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }
done

echo "── 2. Verifications ──"
sleep 3
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
code_post() { curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST https://blindz.app/api/__controle_origine -H 'Content-Type: application/json' -H "Origin: $1" -d '{}'; }
code_socket() { curl -s -o /dev/null -w '%{http_code}' -m 15 "https://blindz.app/socket.io/?EIO=4&transport=polling" -H "Origin: $1"; }
verifie "API en ligne" "curl -sf -m 15 https://blindz.app/api/health >/dev/null"
verifie "nouveau code : recherche Deezer en texte libre avec choix du bon titre" "docker exec blindify-backend grep -q 'pickMatch' /app/dist/services/deezerPreviewService.js"
verifie "solo par lien : une playlist Deezer publique demarre (au moins 5 extraits)" "curl -s -m 90 -X POST https://blindz.app/api/quick-play -H 'Content-Type: application/json' -H 'Origin: https://blindz.app' -d '{\"url\":\"https://www.deezer.com/fr/playlist/1109890291\",\"count\":10}' | grep -q '\"success\":true'"
verifie "nouveau code : reponses copiees a la revelation" "docker exec blindify-backend grep -q 'const snapshot = snapshotResponses(state)' /app/dist/services/gamePersistence.js"
verifie "nouveau code : revelation anticipee commune aux 2 chemins (reponse, deconnexion)" "[ \"\$(docker exec blindify-backend grep -c 'finishEarlyReveal(io, roomCode, revealed);' /app/dist/socketHandlers.js)\" = 2 ]"
verifie "nouveau code : filet anti-AFK jamais pendant une pause" "docker exec blindify-backend grep -q 'revealed.paused' /app/dist/socketHandlers.js"
verifie "POST depuis blindz.app accepte (404 = route inconnue, origine admise)" "[ \"\$(code_post https://blindz.app)\" = 404 ]"
verifie "POST depuis une origine etrangere refuse (403)" "[ \"\$(code_post https://evil.example)\" = 403 ]"
verifie "POST depuis dev.tymmerc.eu refuse en prod (403)" "[ \"\$(code_post https://dev.tymmerc.eu)\" = 403 ]"
verifie "socket depuis blindz.app accepte (200)" "[ \"\$(code_socket https://blindz.app)\" = 200 ]"
verifie "socket depuis une origine etrangere refuse (403)" "[ \"\$(code_socket https://evil.example)\" = 403 ]"
verifie "plus de .env dans le conteneur" "! docker exec blindify-backend test -e /app/.env"
verifie "plus d'undici dans l'image" "! docker exec blindify-backend test -d /app/node_modules/undici"
verifie "engine.io 6.6.11" "docker exec blindify-backend node -p \"require('/app/node_modules/engine.io/package.json').version\" | grep -qx 6.6.11"
verifie "landing servie" "curl -sf -m 30 https://blindz.app/ | grep -q 'Le blind test avec'"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION A ECHOUE : voir ci-dessus"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }

echo "DEPLOIEMENT TERMINE. Parcours complets ensuite, un a la fois :"
echo "  cd /opt/blindify/tools && heavy node soiree.mjs prod"
echo "  cd /opt/blindify/tools && heavy node party-4-joueurs.mjs prod"
echo "  cd /opt/blindify/tools && heavy node anticheat-e2e.mjs prod"
