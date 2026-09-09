#!/bin/bash
# Deploiement prod de la landing (frontend statique uniquement, aucun changement
# backend). A lancer UNIQUEMENT apres GO explicite de Tym.
# Contenu : / = landing serveur (texte pre-rendu), wizard sur /jouer/, QR
# /?join=CODE rediriges, ancien /landing supprime, liens ?join= via publicPath,
# maxPlayers 12 en mode a distance, JSON-LD featureList, sitemap.
set -euo pipefail
cd /opt/blindify

echo "── 1. Build statique prod ──"
systemctl stop blindify-dev-frontend
(
  cd frontend
  unset __NEXT_PRIVATE_STANDALONE_CONFIG NODE_ENV || true
  NEXT_PUBLIC_BASE_PATH="" \
  NEXT_PUBLIC_API_URL="https://blindz.app/api" \
  NEXT_PUBLIC_SOCKET_URL="https://blindz.app" \
  PATH="./.node/bin:$PATH" npx next build
)
systemctl start blindify-dev-frontend

echo "── 2. Verifications (contenu, pas seulement le code HTTP : nginx sert index.html en fallback) ──"
# Le premier curl peut tomber pendant l'ecriture de out/index.html par l'export :
# on laisse retomber la poussiere et on reessaie avant de crier.
sleep 3
H=""
for i in 1 2 3; do
  H="$(curl -sf -m 30 https://blindz.app/ || true)"
  echo "$H" | grep -q "Le blind test avec" && break
  sleep 3
done
echo "$H" | grep -q "Le blind test avec" && echo "  [ok] H1 de la landing dans le HTML prod" || { echo "  !! H1 absent apres 3 essais"; exit 1; }
echo "$H" | grep -q "Zéro préparation" && echo "  [ok] angle différenciant présent" || { echo "  !! angle absent"; exit 1; }
echo "$H" | grep -q "Comment tu t" && { echo "  !! le wizard est encore sur /"; exit 1; } || echo "  [ok] wizard retiré de /"
J="$(curl -sf -m 30 https://blindz.app/jouer/)"
echo "$J" | grep -q "Comment tu t" && echo "  [ok] wizard servi sur /jouer/" || { echo "  !! wizard absent de /jouer/"; exit 1; }
S="$(curl -sf -m 30 https://blindz.app/sitemap.xml)"
[ "$(echo "$S" | grep -c "<loc>")" -ge 9 ] && echo "  [ok] sitemap complet ($(echo "$S" | grep -c "<loc>") URL)" || echo "  !! sitemap incomplet"
echo "$S" | grep -q "blindz.app/faq/" && echo "  [ok] FAQ dans le sitemap" || echo "  !! FAQ absente du sitemap"
curl -sf -m 30 https://blindz.app/faq/ | grep -q 'rel="canonical" href="https://blindz.app/faq/"' && echo "  [ok] canonical propre sur /faq/" || echo "  !! canonical de /faq/ incorrect"
grep -q "Le blind test avec" /opt/blindify/frontend/out/index.html && echo "  [ok] out/index.html contient le texte (ce que lisent les IA)"
echo "DEPLOIEMENT TERMINE. Lancer ensuite :"
echo "  cd /opt/blindify/tools && node landing-shots.mjs prod"
