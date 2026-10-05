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
# Retour arriere : la commande affichee a l'etape 1, et de nouveau si une
# etape ou un controle echoue.
set -euo pipefail
# Le depot qui porte ce script (normalement /opt/blindify, sur main).
DEPOT="$(cd "$(dirname "$0")/.." && pwd)"
# Rien d'autre que --essai ou aucun argument : une faute de frappe (--esai,
# -essai, --dry-run) ne doit jamais lancer le vrai passage.
case "$#:${1:-}" in
  0:|1:--essai) ;;
  *) echo "usage : bash $0 [--essai]" >&2; exit 2 ;;
esac
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
# Un reload rend actif TOUT ce qui a change dans /etc/nginx depuis le dernier
# chargement, pas seulement 10-main.conf. Un fichier plus recent que ce
# chargement est un changement en attente (autre projet, autre session) que ce
# script activerait sans le dire. Date du dernier chargement, de deux facons,
# et on garde la plus ancienne (un fichier de trop a regarder plutot qu'un oubli) :
#  - les workers en service naissent a chaque chargement reussi (systemctl
#    reload comme nginx -s reload) ; un reload refuse garde les anciens ;
#  - le dernier "Reloaded" ou "Started" de nginx.service dans le journal
#    (systemctl reload seulement). systemd 255 n'a pas de propriete
#    ExecReloadStartTimestamp, et ExecReload n'y garde pas d'heure.
dernier_chargement_nginx() {
  local maintenant age workers journal
  maintenant="$(date +%s)"
  age="$( { ps -o etimes=,args= --ppid "$(cat /run/nginx.pid)" || true; } \
    | awk '/worker process/ && !/shutting down/ && $1 > m { m = $1 } END { print m + 0 }')"
  workers=0; [ "$age" -gt 0 ] && workers=$(( maintenant - age ))
  journal="$( { journalctl -u nginx.service -o short-unix --no-pager 2>/dev/null || true; } \
    | awk '/systemd\[1\]: (Reloaded|Started) nginx/ { t = int($1) } END { print t + 0 }')"
  if [ "$workers" -gt 0 ] && [ "$journal" -gt 0 ]; then
    echo $(( workers < journal ? workers : journal ))
  else
    echo $(( workers > journal ? workers : journal ))
  fi
}
en_attente_nginx() {
  local depuis
  depuis="$(dernier_chargement_nginx)"
  if [ "$depuis" -le 0 ]; then echo "(date du dernier chargement de nginx introuvable)"; return 0; fi
  find -L /etc/nginx -type f -newermt "@$depuis" 2>/dev/null || true
}
attente="$(en_attente_nginx)"
if [ -n "$attente" ]; then
  echo "  !! fichiers modifies depuis le dernier chargement de nginx (le reload les activerait aussi) :"
  echo "$attente" | sed 's/^/     /'
  if [ "$ESSAI" = 1 ]; then
    echo "     (essai : a regarder avant le vrai passage)"
  elif [ "${NGINX_EN_ATTENTE_VU:-}" != 1 ]; then
    echo "     Rien n'est touche. Les regarder ; pour les activer avec ce menage : NGINX_EN_ATTENTE_VU=1 bash $0"
    exit 1
  fi
else
  echo "  aucun autre changement en attente dans /etc/nginx"
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
cmp -s "$CONF" "$SAUVE/10-main.conf" || { echo "  !! sauvegarde de 10-main.conf differente : rien n'est touche"; exit 1; }
if [ -f "$SNIPPET" ]; then
  cp -a "$SNIPPET" "$SAUVE/"
  cmp -s "$SNIPPET" "$SAUVE/$(basename "$SNIPPET")" || { echo "  !! sauvegarde du snippet differente : rien n'est touche"; exit 1; }
fi
RETOUR="cp -a $SAUVE/10-main.conf $CONF"
[ -f "$SNIPPET" ] && RETOUR+=" && cp -a $SAUVE/$(basename "$SNIPPET") $SNIPPET"
RETOUR+=" && nginx -t && systemctl reload nginx"
echo "  sauvegarde : $SAUVE"
echo "  retour arriere : $RETOUR"
# Toute commande qui echoue a partir d'ici arrete le script (set -e) : on
# reaffiche alors le retour arriere, pour ne pas avoir a le chercher plus haut.
trap 'echo "  !! arret sur erreur (ligne $LINENO). RETOUR ARRIERE : $RETOUR"' ERR

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
