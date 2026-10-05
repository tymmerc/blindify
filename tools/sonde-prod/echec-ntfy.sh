#!/usr/bin/env bash
# Second canal de la sonde de prod. Quand blindz-sonde-prod.service passe en
# echec (sonde cassee, e-mail du qui n'est pas parti, node introuvable, delai
# depasse), systemd lance blindz-sonde-prod-echec.service (OnFailure=), qui
# lance ce script : une notification ntfy sur le telephone, par la meme methode
# que les autres alertes de /opt/monitoring (curl vers https://ntfy.sh/<sujet>).
#
# Le sujet ntfy est lu a chaque lancement dans /opt/monitoring/.ntfy-topic (une
# ligne), hors du depot, et n'est jamais affiche. Fichier absent ou sujet
# invalide : une ligne dans le journal de l'unite, rien d'autre.
# Variables : NTFY_TOPIC_FILE remplace le chemin du sujet (essais) ;
# MONITOR_SERVICE_RESULT et MONITOR_EXIT_STATUS sont donnees par systemd.
set -u

TOPIC_FILE="${NTFY_TOPIC_FILE:-/opt/monitoring/.ntfy-topic}"

topic="$(head -n 1 "$TOPIC_FILE" 2>/dev/null | tr -d '[:space:]')"
if [ -z "$topic" ]; then
  echo "sonde en echec, aucune notification : pas de sujet ntfy ($TOPIC_FILE absent ou vide)"
  exit 0
fi
if ! [[ "$topic" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; then
  echo "sonde en echec, aucune notification : sujet ntfy invalide dans $TOPIC_FILE"
  exit 0
fi

# Donnees de systemd : on ne garde que des caracteres sans risque.
resultat="$(printf '%s' "${MONITOR_SERVICE_RESULT:-inconnu}" | tr -cd 'a-z-' | head -c 30)"
code="$(printf '%s' "${MONITOR_EXIT_STATUS:-inconnu}" | tr -cd 'A-Za-z0-9' | head -c 20)"

title="[Blindz] la sonde de prod est en echec"
body="La sonde de prod de Blindz a échoué (résultat ${resultat:-inconnu}, code ${code:-inconnu}) : elle ne peut peut-être plus prévenir par e-mail. Code 2 : config d'envoi ou e-mail non parti ; 1 ou 203 : node ou le code de la sonde. Sur le VPS : journalctl -u blindz-sonde-prod -n 40"

http="$(curl -s -m 15 -H "Title: $title" -H "Priority: high" -H "Tags: warning" \
  -d "$body" "https://ntfy.sh/$topic" -o /dev/null -w '%{http_code}')"
echo "notification ntfy : HTTP ${http:-000}"
[ "$http" = 200 ]
