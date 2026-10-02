#!/bin/bash
# Voie rapide : mise en prod du FRONT seul (texte, style, images), sans toucher
# au backend (aucune partie coupee, aucun redemarrage). Creee le 02/10/2026,
# GO de Tym : « pour ce genre de petites modifs on peut pas eviter tout ce
# systeme de verifs ? ». La PR et la CI restent obligatoires (protection de
# main) ; pas de campagne sur la pile ni de relecture pour une modif de texte.
# Pour tout ce qui touche au jeu ou aux donnees : la voie complete.
#
#   heavy bash /opt/blindify/scripts/go-prod-front.sh "texte attendu sur blindz.app"
#
# Le texte attendu prouve que c'est bien la nouvelle version qui est servie.
# Retour arriere : la commande affichee a l'etape 0.
set -euo pipefail
cd /opt/blindify
ATTENDU="${1:?usage : go-prod-front.sh TEXTE_ATTENDU_SUR_LA_PAGE_D_ACCUEIL}"
HORO="$(date +%Y%m%d-%H%M%S)"
NODE22=/root/.nvm/versions/node/v22.21.1/bin

echo "── 0. Garde-fous et sauvegarde ──"
git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "  !! le dossier n'est pas sur origin/main : la prod se deploie depuis main"; exit 1
fi
if [ -n "$(git status --short frontend/ | grep -v '^??')" ]; then
  echo "  !! modifications non commitees dans frontend/"; exit 1
fi
echo "  commit deploye : $(git rev-parse --short HEAD) (main)"
SAUVE="/opt/backups/front-out-avant-$HORO"
cp -a frontend/out "$SAUVE"
RETOUR="rsync -a --delete $SAUVE/ /opt/blindify/frontend/out/"
trap 'echo "  RETOUR ARRIERE : $RETOUR"' ERR
echo "  site actuel sauvegarde : $SAUVE"
echo "  retour arriere : $RETOUR"

echo "── 1. Reconstruction du front (export statique, Node 22) ──"
# Le front de dev tourne dans le meme dossier : on l'arrete pendant la construction.
systemctl stop blindify-dev-frontend
trap 'systemctl start blindify-dev-frontend' EXIT
(
  cd frontend
  unset __NEXT_PRIVATE_STANDALONE_CONFIG NODE_ENV || true
  NEXT_PUBLIC_BASE_PATH="" \
  NEXT_PUBLIC_API_URL="https://blindz.app/api" \
  NEXT_PUBLIC_SOCKET_URL="https://blindz.app" \
  PATH="$NODE22:$PATH" npx next build
)

echo "── 2. Verifications ──"
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
verifie "la page d'accueil sert la nouvelle version (« $ATTENDU »)" "curl -sf -m 30 https://blindz.app/ | grep -qF \"\$ATTENDU\""
verifie "/jouer/ servie" "curl -sf -m 30 -o /dev/null https://blindz.app/jouer/"
verifie "/faq/ servie" "curl -sf -m 30 -o /dev/null https://blindz.app/faq/"
verifie "redirection des anciens QR (/?join=) toujours presente" "curl -sf -m 30 https://blindz.app/ | grep -q 'join'"
verifie "pas de /blindify ecrit en dur dans l'export" "! grep -rqs '/blindify/auth/login' frontend/out/_next/static/chunks"
verifie "API toujours en ligne (non touchee)" "curl -sf -m 15 https://blindz.app/api/health >/dev/null"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION A ECHOUE : voir ci-dessus"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }
echo "MISE EN PROD DU FRONT TERMINEE."
