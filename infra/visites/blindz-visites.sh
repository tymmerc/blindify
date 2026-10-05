#!/usr/bin/env bash
# Rapport de visites de blindz.app (GoAccess), regenere toutes les heures par
# blindz-visites.timer et servi derriere le mot de passe de l'administration :
# https://dev.tymmerc.eu/blindz/visites/
#
# Copie deployee : /usr/local/sbin/blindz-visites (installee a la main depuis
# ce fichier, voir l'en-tete de blindz-visites.service).
#
# Source : /var/log/nginx/blindz-access.log, le journal dedie a blindz.app
# (access_log ajoute le 05/10/2026 dans /etc/nginx/sites-enabled/13-blindz.conf,
# format combined, vraie adresse du client grace au PROXY du 443).
#
# Historique : GoAccess garde ses compteurs sur disque (--persist/--restore) et
# retient l'inode et la derniere ligne lue de chaque fichier. On lui donne a
# chaque passage le journal courant ET celui de la veille (.1, pas encore
# compresse grace a delaycompress) : les lignes ecrites entre le dernier
# passage et la rotation de minuit sont lues dans le .1, sans doublon.
set -euo pipefail

JOURNAL=/var/log/nginx/blindz-access.log
BASE=/var/lib/blindz-visites
DEST_DIR=/opt/dev/blindz/visites
URL_PUBLIQUE=https://dev.tymmerc.eu/blindz/visites/
# Adresses du VPS lui-meme : sonde blindz-uptime toutes les 5 min, scripts E2E
# lances contre la prod, curl de verification. Ce ne sont pas des visiteurs.
IPS_EXCLUES=(46.224.109.59 2a01:4f8:c014:e4d1::1 127.0.0.1 ::1)
# Treize mois d'historique, la duree que la CNIL retient pour la mesure
# d'audience. Les adresses sont deja tronquees (--anonymize-ip).
JOURS_GARDES=395

mkdir -p "$BASE/db" "$DEST_DIR"
chmod 700 "$BASE"

# Un seul passage a la fois : deux GoAccess sur la meme base la corrompraient.
exec 8>"$BASE/verrou"
flock -n 8 || { echo "deja en cours, passage ignore" >&2; exit 0; }

# Garde-fou : rien n'est publie si la page n'est pas derriere le mot de passe.
# 401 attendu. Si elle repond 200 sans identifiants, on retire le rapport.
code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$URL_PUBLIQUE" || true)"
if [ "$code" != "401" ]; then
  echo "ECHEC : $URL_PUBLIQUE repond $code sans mot de passe (401 attendu), rien n'est publie" >&2
  if [ "$code" = "200" ]; then rm -f "$DEST_DIR/index.html"; fi
  exit 1
fi

journaux=()
for f in "$JOURNAL.1" "$JOURNAL"; do
  if [ -f "$f" ]; then journaux+=("$f"); fi
done
if [ "${#journaux[@]}" -eq 0 ]; then
  echo "aucun journal a lire ($JOURNAL absent)" >&2
  exit 1
fi

exclusions=()
for ip in "${IPS_EXCLUES[@]}"; do exclusions+=(--exclude-ip "$ip"); done

# Fichier temporaire dans le meme dossier puis mv : nginx ne sert jamais un
# rapport a moitie ecrit. Le suffixe .html est exige par GoAccess.
tmp="$(mktemp --suffix=.html "$DEST_DIR/rapport.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

LANG=fr_FR.UTF-8 goaccess "${journaux[@]}" \
  --log-format=COMBINED \
  --persist --restore --db-path="$BASE/db" --keep-last="$JOURS_GARDES" \
  --anonymize-ip \
  --ignore-crawlers \
  --no-query-string \
  "${exclusions[@]}" \
  --html-report-title="Visites de blindz.app (heures UTC)" \
  --no-progress \
  -o "$tmp" >/dev/null

chmod 644 "$tmp"
mv -f "$tmp" "$DEST_DIR/index.html"
trap - EXIT
