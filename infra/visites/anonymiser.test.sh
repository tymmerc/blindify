#!/usr/bin/env bash
# Tests du filtre anonymiser.py (rapport de visites de blindz.app) : adresses
# tronquees, adresses du VPS retirees, lignes illisibles ecartees, lignes trop
# recentes reportees au passage suivant, sortie triee par heure.
#
# Usage : bash infra/visites/anonymiser.test.sh
# Besoin de python3 seulement. ANONYMISER=<commande> teste une autre commande
# (par exemple cat, pour voir les tests echouer sans filtre).

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ANONYMISER="${ANONYMISER:-python3 $DIR/anonymiser.py}"
ECHECS=0

ok() { echo "ok    $1"; }
ko() { echo "ECHEC $1"; ECHECS=$((ECHECS + 1)); }

# egal OBTENU ATTENDU NOM
egal() {
  if [ "$1" = "$2" ]; then ok "$3"; else ko "$3"; printf '  attendu : %s\n  obtenu  : %s\n' "$2" "$1"; fi
}

# 05/Oct/2026:12:00:00 +0000 = 1791201600
MAINTENANT=1791201600
l() { echo "$1 - - [$2 +0000] \"GET $3 HTTP/1.1\" 200 512 \"-\" \"Mozilla/5.0\""; }

ENTREE="$(
  l 203.0.113.77            05/Oct/2026:11:00:05 /b
  l 2001:db8:1234:5678::9   05/Oct/2026:11:00:01 /a
  l 198.51.100.7            05/Oct/2026:11:00:02 /vps-v4
  l 2001:db8:ffff::1        05/Oct/2026:11:00:03 /vps-v6
  l 127.0.0.1               05/Oct/2026:11:00:04 /sonde
  l ::ffff:192.0.2.200      05/Oct/2026:11:00:06 /c
  l 2001:db8::42            05/Oct/2026:11:00:07 /d
  l pas-une-adresse         05/Oct/2026:11:00:08 /e
  echo "203.0.113.5 - - [date cassee] \"GET /f HTTP/1.1\" 200 1 \"-\" \"-\""
  l 203.0.113.9             05/Oct/2026:11:59:58 /limite
  l 203.0.113.10            05/Oct/2026:11:59:59 /trop-recente
  # 13:59:00 a +0200, soit 11:59:00 UTC : gardee.
  echo '203.0.113.11 - - [05/Oct/2026:13:59:00 +0200] "GET /fuseau HTTP/1.1" 200 1 "-" "-"'
)"

SORTIE="$(BLINDZ_VISITES_IPS_LOCALES="198.51.100.7 2001:db8:ffff::1 127.0.0.1 ::1" \
  BLINDZ_VISITES_MAINTENANT="$MAINTENANT" $ANONYMISER <<< "$ENTREE" 2>/dev/null)" || true

egal "$(cut -d' ' -f1,7 <<< "$SORTIE" | tr '\n' ' ')" \
  "2001:db8:1234:: /a 203.0.113.0 /b 192.0.2.0 /c 2001:db8:: /d 203.0.113.0 /fuseau 203.0.113.0 /limite " \
  "adresses tronquees (/24, /48, IPv4 dans IPv6), VPS retire, triees par heure"

if grep -Eq '203\.0\.113\.(77|9|11)|192\.0\.2\.200|5678|::9|::42' <<< "$SORTIE"; then
  ko "aucune adresse entiere dans la sortie"
else
  ok "aucune adresse entiere dans la sortie"
fi

egal "$(grep -c '/trop-recente' <<< "$SORTIE" || true)" "0" \
  "ligne des 2 dernieres secondes reportee au passage suivant"

egal "$(grep -c -e '/e ' -e '/f ' <<< "$SORTIE" || true)" "0" \
  "lignes sans adresse ou sans date ecartees"

# Sans adresses forcees, le filtre lit celles de la machine : la boucle locale
# en fait toujours partie.
egal "$(BLINDZ_VISITES_MAINTENANT="$MAINTENANT" $ANONYMISER 2>/dev/null \
  <<< "$(l 127.0.0.1 05/Oct/2026:11:00:00 /sonde)" | wc -l)" "0" \
  "adresses de la machine lues dans /proc : 127.0.0.1 retiree"

COMPTE="$(BLINDZ_VISITES_IPS_LOCALES="198.51.100.7 2001:db8:ffff::1 127.0.0.1 ::1" \
  BLINDZ_VISITES_MAINTENANT="$MAINTENANT" $ANONYMISER <<< "$ENTREE" 2>&1 >/dev/null || true)"
egal "$COMPTE" "lues=12 vps=3 illisibles=2 reportees=1" "compteurs dans le journal du service"

echo
if [ "$ECHECS" -gt 0 ]; then
  echo "$ECHECS echec(s)"
  exit 1
fi
echo "tous les tests passent"
