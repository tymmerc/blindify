#!/bin/bash
# Services de DEV de Blindz hors de root (audit menage technique du 05/10/2026).
# A lancer UNIQUEMENT apres le GO de Tym, quand la PR du menage est fusionnee
# et que /opt/blindify est sur main a jour (le code LISTEN_HOST, LOG_DIR et
# NEXT_DIST_DIR doit y etre). Ne touche pas a la prod : seuls le backend de
# dev (:3097), le front de dev (:3099) et l'explorateur de base (:3101)
# redemarrent. Le site de dev est coupe une minute environ.
#
#   bash /opt/blindify/scripts/go-prod-2026-10-05-services-dev.sh --essai   # verifie tout, ne touche a rien
#   bash /opt/blindify/scripts/go-prod-2026-10-05-services-dev.sh           # applique
#
# Ce que ca fait :
#   - copie le binaire Node 22 dans /opt/node (les autres utilisateurs n'ont
#     pas acces a /root/.nvm) ;
#   - cree deux utilisateurs systeme sans shell : blindz-dev-back et
#     blindz-dev-front (un par service : l'un ne lit pas les secrets de l'autre) ;
#   - donne au front de dev son dossier .next-dev (la construction de prod,
#     en root, garde .next) ;
#   - pose les trois fichiers de durcissement de infra/menage-2026-10-05/systemd/.
# L'explorateur de base reste root (il appelle docker), mais sans capacites.
# Chiffres et raisons : /opt/mira/dossier/docs-blindz/MENAGE-TECHNIQUE-2026-10-05.md
#
# Retour arriere : la commande affichee a l'etape 1.
set -euo pipefail
DEPOT="$(cd "$(dirname "$0")/.." && pwd)"
ESSAI=0
[ "${1:-}" = "--essai" ] && ESSAI=1
SRC="$DEPOT/infra/menage-2026-10-05/systemd"
UNITES="blindz-db-browser blindify-dev-backend blindify-dev-frontend"
NODE_SRC=/root/.nvm/versions/node/v22.21.1/bin/node
NODE_DST=/opt/node/v22.21.1/bin/node
FRONT=/opt/blindify/frontend
HORO="$(date +%Y%m%d-%H%M%S)"
SAUVE="/opt/backups/systemd-menage-avant-$HORO"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

score() { systemd-analyze security "$@" --no-pager 2>/dev/null | tail -1 | sed 's/.*: //'; }

echo "── 0. Garde-fous ──"
[ "$(id -u)" = 0 ] || { echo "  !! a lancer en root"; exit 1; }
for u in $UNITES; do
  [ -f "/etc/systemd/system/$u.service" ] || { echo "  !! unite absente : $u"; exit 1; }
  [ -f "$SRC/$u.service.d/60-durcissement.conf" ] || { echo "  !! durcissement absent du depot : $u"; exit 1; }
done
[ -x "$NODE_SRC" ] || [ -x "$NODE_DST" ] || { echo "  !! Node 22 introuvable ($NODE_SRC)"; exit 1; }
# Le code qui lit LISTEN_HOST, LOG_DIR et NEXT_DIST_DIR doit etre la ou les
# services tournent, sinon le backend de dev ecouterait encore partout et
# ecrirait ses journaux dans logs/, en lecture seule pour lui.
manque=""
grep -qs "LISTEN_HOST" /opt/blindify/backend/src/config/listen.ts || manque+=" LISTEN_HOST"
grep -qs "LOG_DIR" /opt/blindify/backend/src/utils/logger.ts || manque+=" LOG_DIR"
grep -qs "NEXT_DIST_DIR" "$FRONT/next.config.js" || manque+=" NEXT_DIST_DIR"
grep -qs ".next-dev/types" "$FRONT/tsconfig.json" || manque+=" tsconfig(.next-dev)"
if [ -n "$manque" ]; then
  echo "  !! /opt/blindify n'a pas encore le code du menage :$manque"
  [ "$ESSAI" = 1 ] && echo "     (normal avant la fusion de la PR ; l'essai continue)" || exit 1
fi
# Fichiers que les services doivent lire et qu'un autre utilisateur ne peut pas lire.
illisibles="$(find /opt/blindify/backend /opt/blindify/frontend /opt/blindify/shared \
  \( -path '*/node_modules' -o -path "$FRONT/.next" -o -path "$FRONT/.next-dev" -o -path "$FRONT/out" -o -name '.env*' \) -prune \
  -o ! -perm -o+r -print 2>/dev/null | head -5)"
[ -z "$illisibles" ] || { echo "  !! fichiers illisibles pour les nouveaux utilisateurs :"; echo "$illisibles" | sed 's/^/     /'; exit 1; }
echo "  exposition actuelle (systemd-analyze security, 10 = rien de protege) :"
for u in $UNITES; do echo "    $u : $(score "$u.service")"; done

# Les unites telles qu'elles seront, construites a cote pour verification.
mkdir -p "$TMP/racine/etc/systemd/system" "$TMP/verif"
for u in $UNITES; do
  for d in "$TMP/racine/etc/systemd/system" "$TMP/verif"; do
    cp "/etc/systemd/system/$u.service" "$d/"
    mkdir -p "$d/$u.service.d"
    cp "$SRC/$u.service.d/60-durcissement.conf" "$d/$u.service.d/"
  done
done
echo "  exposition apres durcissement (calculee hors ligne) :"
for u in $UNITES; do echo "    $u : $(score --offline=true --root="$TMP/racine" "$u.service")"; done
# Garde toute ligne qui parle de ces unites (cle inconnue, valeur invalide...).
# "is not executable" est attendu en essai : /opt/node n'existe pas encore.
verif="$(cd "$TMP/verif" && systemd-analyze verify $(for u in $UNITES; do printf '%s ' "$TMP/verif/$u.service"; done) 2>&1 \
  | grep -E "^($TMP/verif|blindify-dev-|blindz-db-browser)" | grep -v "is not executable" || true)"
[ -z "$verif" ] || { echo "  !! systemd-analyze verify signale :"; echo "$verif" | sed 's/^/     /'; exit 1; }
echo "  syntaxe des unites durcies : OK"

if [ "$ESSAI" = 1 ]; then
  echo "ESSAI OK : rien n'a ete modifie."
  exit 0
fi

dispo_go=$(( $(awk '/^MemAvailable:/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
[ "$dispo_go" -ge 3 ] || { echo "  !! moins de 3 Go de memoire disponible (${dispo_go} Go) : next dev va recompiler, attendre"; exit 1; }

echo "── 1. Sauvegarde ──"
mkdir -p "$SAUVE"
for u in $UNITES; do
  cp -a "/etc/systemd/system/$u.service" "$SAUVE/"
  [ -d "/etc/systemd/system/$u.service.d" ] && cp -a "/etc/systemd/system/$u.service.d" "$SAUVE/"
done
RETOUR="rm -f $(for u in $UNITES; do printf '/etc/systemd/system/%s.service.d/60-durcissement.conf ' "$u"; done)&& systemctl daemon-reload && systemctl restart $UNITES"
echo "  sauvegarde : $SAUVE"
echo "  retour arriere : $RETOUR"
echo "  (les utilisateurs, /opt/node et $FRONT/.next-dev peuvent rester, ils ne genent pas)"

echo "── 2. Node, utilisateurs, dossiers ──"
if ! cmp -s "$NODE_SRC" "$NODE_DST" 2>/dev/null; then
  install -D -o root -g root -m 0755 "$NODE_SRC" "$NODE_DST"
fi
echo "  $NODE_DST : $("$NODE_DST" --version)"
for compte in blindz-dev-back blindz-dev-front; do
  id "$compte" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$compte"
  echo "  utilisateur $compte : $(id "$compte")"
done
install -d -o blindz-dev-front -g blindz-dev-front -m 0750 "$FRONT/.next-dev"
[ -e "$FRONT/next-env.d.ts" ] || touch "$FRONT/next-env.d.ts"
chown blindz-dev-front:blindz-dev-front "$FRONT/next-env.d.ts"

echo "── 3. Durcissement ──"
for u in $UNITES; do
  install -D -o root -g root -m 0644 "$SRC/$u.service.d/60-durcissement.conf" "/etc/systemd/system/$u.service.d/60-durcissement.conf"
done
systemctl daemon-reload
for u in $UNITES; do systemctl restart "$u"; done

echo "── 4. Verifications ──"
ko=0
verifie() { if eval "$2"; then echo "  [ok] $1"; else echo "  !! $1"; ko=1; fi; }
# stat plutot que ps : ps coupe les noms d'utilisateur au-dela de 8 caracteres.
utilisateur() { stat -c %U "/proc/$(systemctl show -p MainPID --value "$1")"; }
attend() { for _ in $(seq 1 "$2"); do eval "$1" && return 0; sleep 2; done; return 1; }
attend "curl -sf -m 5 http://127.0.0.1:3097/api/health >/dev/null" 30 || true
attend "[ \"\$(curl -s -o /dev/null -m 60 -w '%{http_code}' https://dev.tymmerc.eu/blindify/)\" = 200 ]" 60 || true
for u in $UNITES; do verifie "$u actif" "systemctl is-active --quiet $u"; done
verifie "backend de dev sous blindz-dev-back" "[ \"\$(utilisateur blindify-dev-backend)\" = blindz-dev-back ]"
verifie "front de dev sous blindz-dev-front" "[ \"\$(utilisateur blindify-dev-frontend)\" = blindz-dev-front ]"
verifie "backend de dev sur 127.0.0.1:3097 seulement" "ss -ltn | grep -E '127\\.0\\.0\\.1:3097 ' >/dev/null && ! ss -ltn | grep -E '(0\\.0\\.0\\.0|\\*|\\[::\\]):3097 ' >/dev/null"
verifie "front de dev sur 127.0.0.1:3099 seulement" "ss -ltn | grep -E '127\\.0\\.0\\.1:3099 ' >/dev/null && ! ss -ltn | grep -E '(0\\.0\\.0\\.0|\\*|\\[::\\]):3099 ' >/dev/null"
verifie "API de dev en ligne" "curl -sf -m 15 https://dev.tymmerc.eu/blindify/api/health | grep -F >/dev/null '\"status\":\"ok\"'"
verifie "site de dev en ligne" "[ \"\$(curl -s -o /dev/null -m 60 -w '%{http_code}' https://dev.tymmerc.eu/blindify/)\" = 200 ]"
verifie "journaux du backend de dev a part" "ls /var/log/blindz-dev-back/ | grep -F >/dev/null combined.log"
verifie "explorateur de base : sante lue (docker + base)" "curl -sf -m 15 http://127.0.0.1:3101/api/sante | grep -F >/dev/null '\"etat\":\"healthy\"'"
verifie "le front de dev ne peut plus ecrire le site de prod" "! runuser -u blindz-dev-front -- test -w $FRONT/out"
verifie "le backend de dev ne lit plus le .env de prod" "! runuser -u blindz-dev-back -- test -r /opt/blindify/backend/.env"
verifie "Next n'a pas reecrit tsconfig.json" "git -C /opt/blindify diff --quiet -- frontend/tsconfig.json"
verifie "API de prod toujours en ligne (non touchee)" "curl -sf -m 15 https://blindz.app/api/health | grep -F >/dev/null '\"status\":\"ok\"'"
echo "  exposition apres durcissement :"
for u in $UNITES; do echo "    $u : $(score "$u.service")"; done
[ "$ko" = 0 ] || { echo "UNE VERIFICATION A ECHOUE : voir ci-dessus et journalctl -u <unite>"; echo "  RETOUR ARRIERE : $RETOUR"; exit 1; }
echo "SERVICES DE DEV DURCIS. A surveiller quelques jours : journalctl -u blindify-dev-frontend -p warning"
