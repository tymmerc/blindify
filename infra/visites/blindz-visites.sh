#!/usr/bin/env bash
# Rapport de visites de blindz.app (GoAccess), regenere toutes les heures par
# blindz-visites.timer et servi derriere le mot de passe de l'administration :
# https://dev.tymmerc.eu/blindz/visites/
#
# Copie deployee : /usr/local/sbin/blindz-visites, avec son filtre
# /usr/local/lib/blindz-visites/anonymiser.py (installes a la main depuis ce
# dossier, voir l'en-tete de blindz-visites.service).
#
# Source : /var/log/nginx/blindz-access.log, le journal dedie a blindz.app
# (access_log ajoute le 05/10/2026 dans /etc/nginx/sites-enabled/13-blindz.conf,
# format combined, vraie adresse du client grace au PROXY du 443).
#
# Adresses : GoAccess ne lit jamais le journal lui-meme. Les lignes passent
# d'abord par anonymiser.py, qui retire celles du VPS (ses propres adresses,
# lues au lancement) et tronque les autres (IPv4 en /24, IPv6 en /48). La base
# de GoAccess sur disque ne contient donc aucune adresse entiere.
#
# Historique : GoAccess garde ses compteurs sur disque (--persist/--restore).
# On lui passe a chaque passage le journal de la veille (.1, pas encore
# compresse grace a delaycompress) puis le courant, par un tube. Sur un tube,
# il retient l'heure de la derniere ligne lue et saute au passage suivant tout
# ce qui n'est pas plus recent : pas de doublon d'un passage a l'autre ni a la
# rotation de minuit (le filtre trie les lignes et garde la seconde en cours
# pour le tour suivant). Un tube vide remettrait cette heure a zero et tout
# serait recompte au passage suivant : sans ligne de visiteur, GoAccess ne
# tourne pas.
set -euo pipefail

JOURNAL=/var/log/nginx/blindz-access.log
BASE=/var/lib/blindz-visites
DEST_DIR=/opt/dev/blindz/visites
URL_PUBLIQUE=https://dev.tymmerc.eu/blindz/visites/
ANONYMISER=/usr/local/lib/blindz-visites/anonymiser.py
# Onglet « Qui joue » de l'administration : d'ou arrivent les joueurs, en
# comptes par jour et par salle, sans adresse (voir l'en-tete du script).
ARRIVEES=/usr/local/lib/blindz-visites/arrivees.py
ARRIVEES_JSON="$DEST_DIR/arrivees.json"
# Treize mois d'historique, la duree que la CNIL retient pour la mesure
# d'audience. Les adresses arrivent deja tronquees (anonymiser.py).
JOURS_GARDES=395

mkdir -p "$BASE/db" "$DEST_DIR"
chmod 700 "$BASE"

# Un seul passage a la fois : deux GoAccess sur la meme base la corrompraient.
exec 8>"$BASE/verrou"
flock -n 8 || { echo "deja en cours, passage ignore" >&2; exit 0; }

# Garde-fou : rien n'est publie si la page n'est pas derriere le mot de passe.
# 401 attendu. Toute autre reponse (200, 403, 404, 500, pas de reponse) : on
# retire le rapport deja publie, par prudence, et on s'arrete.
code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$URL_PUBLIQUE" || true)"
if [ "$code" != "401" ]; then
  echo "ECHEC : $URL_PUBLIQUE repond $code sans mot de passe (401 attendu), rapport retire" >&2
  rm -f "$DEST_DIR/index.html" "$ARRIVEES_JSON"
  exit 1
fi

# Arrivees : les 14 jours de journaux, du plus ancien au plus recent (.14.gz
# ... .2.gz, .1, courant). Un echec n'empeche pas le rapport GoAccess, mais
# le passage finit en erreur (visible dans journalctl -u blindz-visites).
echec_arrivees=0
tous=()
for i in $(seq 14 -1 2); do
  if [ -f "$JOURNAL.$i.gz" ]; then tous+=("$JOURNAL.$i.gz"); fi
done
for f in "$JOURNAL.1" "$JOURNAL"; do
  if [ -f "$f" ]; then tous+=("$f"); fi
done
if [ "${#tous[@]}" -gt 0 ]; then
  PYTHONDONTWRITEBYTECODE=1 python3 "$ARRIVEES" --etat "$BASE/arrivees.json" \
    --sortie "$ARRIVEES_JSON" "${tous[@]}" || {
    echo "ECHEC des arrivees (onglet Qui joue), ancien fichier garde" >&2
    echec_arrivees=1
  }
fi

journaux=()
for f in "$JOURNAL.1" "$JOURNAL"; do
  if [ -f "$f" ]; then journaux+=("$f"); fi
done
if [ "${#journaux[@]}" -eq 0 ]; then
  echo "aucun journal a lire ($JOURNAL absent)" >&2
  exit 1
fi

# Lignes filtrees (adresses deja tronquees) dans un fichier de la base, pour
# savoir s'il y en a avant de lancer GoAccess.
lignes="$(mktemp "$BASE/lignes.XXXXXX")"
# Rapport : fichier temporaire dans le meme dossier puis mv, nginx ne sert
# jamais un rapport a moitie ecrit. Le suffixe .html est exige par GoAccess.
tmp="$(mktemp --suffix=.html "$DEST_DIR/rapport.XXXXXX")"
trap 'rm -f "$lignes" "$tmp"' EXIT

cat "${journaux[@]}" | python3 "$ANONYMISER" > "$lignes"
if [ ! -s "$lignes" ]; then
  echo "aucune ligne de visiteur dans les journaux, base et rapport inchanges"
  exit "$echec_arrivees"
fi

# "-" : GoAccess lit l'entree standard comme un tube (sans inode), meme
# redirigee depuis un fichier. --anonymize-ip reste en seconde ceinture, sans
# effet sur une adresse deja tronquee.
LANG=fr_FR.UTF-8 goaccess - < "$lignes" \
  --log-format=COMBINED \
  --persist --restore --db-path="$BASE/db" --keep-last="$JOURS_GARDES" \
  --anonymize-ip \
  --ignore-crawlers \
  --no-query-string \
  --html-report-title="Visites de blindz.app (heures UTC)" \
  --no-progress \
  -o "$tmp" >/dev/null

rm -f "$lignes"
chmod 644 "$tmp"
mv -f "$tmp" "$DEST_DIR/index.html"
trap - EXIT
exit "$echec_arrivees"
