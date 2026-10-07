#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/backups/blindify"
CONTAINER="blindify-postgres"
DB_NAME="blindify"
DB_USER="blindify"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"

# Les dumps contiennent toute la base (donnees des joueurs, empreintes de mots
# de passe) : lisibles par root seulement. Avant le 05/10 ils etaient en 644
# dans un dossier ouvert, alors que le serveur a d'autres comptes locaux.
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[$(date)] Starting backup of ${DB_NAME}..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date)] Backup OK: ${BACKUP_FILE} (${SIZE})"
else
  echo "[$(date)] ERROR: Backup file missing or empty!" >&2
  exit 1
fi

# Cleanup old backups
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned up ${DELETED} backups older than ${RETENTION_DAYS} days"
fi
