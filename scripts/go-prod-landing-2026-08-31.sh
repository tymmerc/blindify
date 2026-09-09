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
# Chaque curl peut tomber pendant que l'export reecrit le fichier vise : toute
# verification passe par attend(), qui reessaie avant de crier. Sans ca on a
# deja eu deux fausses alertes (H1, puis canonical de /faq/) sur une prod saine.
sleep 3

# attend <url> <motif> -> imprime le corps si le motif finit par apparaitre
attend() {
  local url="$1" motif="$2" corps=""
  for _ in 1 2 3 4; do
    corps="$(curl -sf -m 30 "$url" || true)"
    if printf '%s' "$corps" | grep -q "$motif"; then printf '%s' "$corps"; return 0; fi
    sleep 3
  done
  printf '%s' "$corps"
  return 1
}

# doit <libelle> <url> <motif> [fatal]
doit() {
  local libelle="$1" url="$2" motif="$3" fatal="${4:-oui}"
  if attend "$url" "$motif" >/dev/null; then
    echo "  [ok] $libelle"
  else
    echo "  !! $libelle : introuvable apres 4 essais"
    [ "$fatal" = "oui" ] && exit 1
  fi
}

H="$(attend https://blindz.app/ "Le blind test avec")" || { echo "  !! H1 absent apres 4 essais"; exit 1; }
echo "  [ok] H1 de la landing dans le HTML prod"
echo "$H" | grep -q "Zéro préparation" && echo "  [ok] angle différenciant présent" || { echo "  !! angle absent"; exit 1; }
echo "$H" | grep -q "Comment tu t" && { echo "  !! le wizard est encore sur /"; exit 1; } || echo "  [ok] wizard retiré de /"
echo "$H" | grep -q "<summary" && echo "  [ok] accordéon FAQ sur la landing" || echo "  !! accordéon FAQ absent de la landing"
echo "$H" | grep -q "logo-mark" && echo "  [ok] logo présent (en-tête et disque)" || echo "  !! logo absent de la landing"

doit "wizard servi sur /jouer/" https://blindz.app/jouer/ "Comment tu t"
doit "canonical propre sur /faq/" https://blindz.app/faq/ 'rel="canonical" href="https://blindz.app/faq/"'
doit "réponses repliées dans le HTML de /faq/" https://blindz.app/faq/ "incendie du datacenter OVH"

S="$(attend https://blindz.app/sitemap.xml "blindz.app/faq/")" || echo "  !! FAQ absente du sitemap"
N="$(echo "$S" | grep -c "<loc>")"
[ "$N" -ge 9 ] && echo "  [ok] sitemap complet ($N URL)" || echo "  !! sitemap incomplet ($N URL)"

grep -q "Le blind test avec" /opt/blindify/frontend/out/index.html && echo "  [ok] out/index.html contient le texte (ce que lisent les IA)"
echo "DEPLOIEMENT TERMINE. Verifications completes :"
echo "  node ../tools/landing-shots.mjs prod"
echo "  cd /opt/blindify/frontend && node ../tools/faq-shots.mjs prod"
echo "  cd /opt/blindify/frontend && node ../tools/vinyl-shot.mjs prod"
