#!/usr/bin/env bash
# Affiche les rapports de bug envoyes depuis l'app (les plus recents d'abord).
# Usage : bash /opt/blindify/tools/bugs.sh [nombre]  (defaut 20)
set -euo pipefail
LIMIT="${1:-20}"

docker compose -f /opt/blindify/docker-compose.yml exec -T postgres \
  psql -U blindify -d blindify -P pager=off -c "
SELECT to_char(b.created_at,'DD/MM HH24:MI') AS quand,
       COALESCE(u.username, 'invite')        AS qui,
       b.message,
       b.page_url                            AS page
FROM bug_reports b
LEFT JOIN users u ON u.id = b.user_id
ORDER BY b.created_at DESC
LIMIT ${LIMIT};"
