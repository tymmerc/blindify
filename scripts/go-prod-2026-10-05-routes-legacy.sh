#!/bin/bash
# Menage des anciennes routes Blindz sur tymmerc.eu (audit du 05/10/2026).
# A lancer UNIQUEMENT apres le GO de Tym. Pas besoin de heavy : rien ne se
# construit, nginx relit sa configuration (reload, aucune connexion coupee).
#
#   bash /opt/blindify/scripts/go-prod-2026-10-05-routes-legacy.sh --essai   # verifie tout, ne touche a rien
#   bash /opt/blindify/scripts/go-prod-2026-10-05-routes-legacy.sh           # applique
#
# Ce qui change dans /etc/nginx/sites-enabled/10-main.conf (tymmerc.eu) :
#   - les relais /blindify/api/, /blindify/socket.io/, /blindify/auth/spotify/login
#     et l'alias /blindify/_next/static/ disparaissent : ces adresses tombent
#     dans la redirection 301 vers blindz.app, meme chemin ;
#   - l'ancien catch-all de la racine (/auth, /settings, /demo...) disparait :
#     ces chemins retombent sur la page d'accueil de tymmerc.eu, comme toute
#     adresse inconnue ;
#   - les trois blocs /demo/blindify-game disparaissent (jamais atteints) ;
#   - /blindify et /blindify/... restent en 301 vers blindz.app.
# Le snippet orphelin /etc/nginx/snippets/blindify-redirects.conf (inclus
# nulle part) part dans la sauvegarde.
# Chiffres et raisons : /opt/mira/dossier/docs-blindz/MENAGE-TECHNIQUE-2026-10-05.md
#
# Retour arriere : la commande affichee a l'etape 0.
set -euo pipefail
# Le depot qui porte ce script (normalement /opt/blindify, sur main).
DEPOT="$(cd "$(dirname "$0")/.." && pwd)"
ESSAI=0
[ "${1:-}" = "--essai" ] && ESSAI=1
CONF=/etc/nginx/sites-enabled/10-main.conf
SNIPPET=/etc/nginx/snippets/blindify-redirects.conf
PATCH="$DEPOT/infra/menage-2026-10-05/nginx-10-main-routes-legacy.patch"
HORO="$(date +%Y%m%d-%H%M%S)"
SAUVE="/opt/backups/nginx-menage-avant-$HORO"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "── 0. Garde-fous ──"
[ "$(id -u)" = 0 ] || { echo "  !! a lancer en root"; exit 1; }
[ -f "$PATCH" ] || { echo "  !! patch introuvable : $PATCH (dossier sur main a jour ?)"; exit 1; }
# --fuzz=0 : le contexte doit correspondre exactement au fichier audite.
# (Pas de test "a l'envers" : deux blocs du patch ne font que retirer des
# lignes, leur inverse s'appliquerait aussi sur le fichier d'origine.)
if ! patch --dry-run --forward --batch --silent --fuzz=0 "$CONF" <"$PATCH" >/dev/null 2>&1; then
  if grep -qF "ont ete retires apres l'audit du" "$CONF" && ! grep -qF "location ~ ^/blindify/api/" "$CONF"; then
    echo "  deja applique : rien a faire"; exit 0
  fi
  echo "  !! le patch ne s'applique pas proprement : 10-main.conf a change depuis l'audit. Rien n'est touche."; exit 1
fi
nginx -t 2>/dev/null || { echo "  !! nginx -t echoue AVANT toute modification : corriger d'abord"; exit 1; }
if grep -rqs --exclude="$(basename "$SNIPPET")" "blindify-redirects" /etc/nginx/; then
  echo "  !! le snippet blindify-redirects.conf est inclus quelque part : a regarder avant"; exit 1
fi
echo "  patch applicable, nginx -t actuel OK, snippet orphelin confirme"
echo "  usage des anciennes routes sur les journaux disponibles (comparer a l'audit) :"
python3 "$DEPOT/scripts/mesure-routes-legacy.py" | sed 's/^/    /'

# Nouvelle version construite a cote, jamais dans /etc tant qu'elle n'est pas validee.
cp "$CONF" "$TMP/10-main.conf"
patch --forward --batch --silent --fuzz=0 --no-backup-if-mismatch "$TMP/10-main.conf" <"$PATCH"

if [ "$ESSAI" = 1 ]; then
  echo "── Essai : nginx -t sur une copie de la configuration avec le patch ──"
  mkdir "$TMP/arbre"
  for f in /etc/nginx/*; do [ "$(basename "$f")" = nginx.conf ] || ln -s "$f" "$TMP/arbre/$(basename "$f")"; done
  sites=""
  for f in /etc/nginx/sites-enabled/*.conf; do
    if [ "$f" = "$CONF" ]; then sites+="    include $TMP/10-main.conf;"$'\n'; else sites+="    include $f;"$'\n'; fi
  done
  awk -v sites="$sites" '
    /include \/etc\/nginx\/sites-enabled\/\*\.conf;/ { printf "%s", sites; next }
    /^pid / { print "pid '"$TMP"'/nginx.pid;"; next }
    { print }' /etc/nginx/nginx.conf >"$TMP/arbre/nginx.conf"
  nginx -t -c "$TMP/arbre/nginx.conf"
  echo "ESSAI OK : le patch s'applique et la configuration obtenue passe nginx -t. Rien n'a ete modifie."
  exit 0
fi

echo "── 1. Sauvegarde ──"
mkdir -p "$SAUVE"
cp -a "$CONF" "$SAUVE/10-main.conf"
[ -f "$SNIPPET" ] && cp -a "$SNIPPET" "$SAUVE/"
RETOUR="cp -a $SAUVE/10-main.conf $CONF"
[ -f "$SNIPPET" ] && RETOUR+=" && cp -a $SAUVE/$(basename "$SNIPPET") $SNIPPET"
RETOUR+=" && nginx -t && systemctl reload nginx"
echo "  sauvegarde : $SAUVE"
echo "  retour arriere : $RETOUR"

echo "── 2. Nouvelle configuration ──"
cat "$TMP/10-main.conf" >"$CONF"   # garde proprietaire et droits du fichier
if ! nginx -t; then
  echo "  !! nginx -t refuse la nouvelle configuration : sauvegarde remise, rien n'a ete recharge"
  cp -a "$SAUVE/10-main.conf" "$CONF"; exit 1
fi
rm -f "$SNIPPET"
systemctl reload nginx
sleep 2

echo "── 3. Verifications ──"
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
rep() { curl -s -o /dev/null -m 15 -w '%{http_code} %{redirect_url}' "$1"; }
verifie "/blindify part toujours vers blindz.app" "[ \"\$(rep https://tymmerc.eu/blindify)\" = '301 https://blindz.app/' ]"
verifie "un ancien lien de defi garde son chemin et son code" "[ \"\$(rep 'https://tymmerc.eu/blindify/challenge/?code=TEST')\" = '301 https://blindz.app/challenge/?code=TEST' ]"
verifie "/blindify/api/ n'est plus relaye (301 vers blindz.app)" "[ \"\$(rep https://tymmerc.eu/blindify/api/health)\" = '301 https://blindz.app/api/health' ]"
verifie "/blindify/socket.io/ n'est plus relaye (301 vers blindz.app)" "[ \"\$(rep 'https://tymmerc.eu/blindify/socket.io/?EIO=4&transport=inconnu')\" = '301 https://blindz.app/socket.io/?EIO=4&transport=inconnu' ]"
verifie "/blindify/_next/static/ n'est plus servi ici (301 vers blindz.app)" "[ \"\$(rep https://tymmerc.eu/blindify/_next/static/x.js)\" = '301 https://blindz.app/_next/static/x.js' ]"
verifie "/auth ne redirige plus (page d'accueil de tymmerc.eu)" "[ \"\$(rep https://tymmerc.eu/auth)\" = '200 ' ]"
verifie "/demo/blindify-game/ ne redirige plus" "[ \"\$(rep https://tymmerc.eu/demo/blindify-game/)\" = '200 ' ]"
verifie "fichiers caches toujours refuses" "[ \"\$(rep https://tymmerc.eu/settings/.env)\" = '404 ' ]"
verifie "tymmerc.eu en ligne" "[ \"\$(rep https://tymmerc.eu/)\" = '200 ' ]"
verifie "/clearpath/ en ligne" "[ \"\$(rep https://tymmerc.eu/clearpath/)\" = '200 ' ]"
verifie "/shimmer/ en ligne" "[ \"\$(rep https://tymmerc.eu/shimmer/)\" = '200 ' ]"
verifie "/portfolio redirige toujours" "[ \"\$(rep https://tymmerc.eu/portfolio)\" = '301 https://portfolio.tymmerc.eu/' ]"
verifie "blindz.app en ligne (non touche)" "[ \"\$(rep https://blindz.app/)\" = '200 ' ]"
verifie "API de blindz.app en ligne (non touchee)" "curl -sf -m 15 https://blindz.app/api/health | grep -F >/dev/null '\"status\":\"ok\"'"
[ "$ko" = 0 ] || { echo "UNE VERIFICATION A ECHOUE : voir ci-dessus"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }
echo "MENAGE NGINX TERMINE. A refaire dans quelques semaines : python3 scripts/mesure-routes-legacy.py"
