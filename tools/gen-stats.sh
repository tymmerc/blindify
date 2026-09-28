#!/bin/bash
# Genere les statistiques du tableau de bord prive.
# Lit la base de PRODUCTION en LECTURE SEULE et ecrit un JSON servi par nginx
# sur dev.tymmerc.eu/blindz-stats/ (protege par mot de passe).
set -euo pipefail
DEST=/opt/dev/blindz-stats
mkdir -p "$DEST"
TMP="$(mktemp)"
docker exec -i blindify-postgres psql -U blindify -d blindify -qAt \
  < /opt/blindify/tools/stats.sql > "$TMP"
# On ne remplace le fichier servi que si la requete a produit du JSON valide,
# sinon un echec passager afficherait un tableau de bord vide.
if python3 -c "import json,sys; json.load(open('$TMP'))" 2>/dev/null; then
  mv "$TMP" "$DEST/data.json"
  chmod 644 "$DEST/data.json"
else
  rm -f "$TMP"
  echo "JSON invalide, ancien fichier conserve" >&2
  exit 1
fi
