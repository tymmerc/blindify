#!/usr/bin/env bash
# Photographie la structure de la base de prod (aucune donnee) dans
# backend/db/schema.sql. C'est ce fichier que chargent la base de test locale
# (npm run test:db) et le Postgres de la CI : les tests tournent sur le vrai
# schema, pas sur le vieux backend/schema.sql (19 tables quand la prod en a 24).
#
#   bash tools/schema-snapshot.sh           regenere le fichier, a commiter
#   bash tools/schema-snapshot.sh --check   sort en 1 si la prod a derive
#                                           (lance par la campagne de nuit)
#
# Lecture seule cote prod : pg_dump --schema-only ne lit que le catalogue.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/backend/db/schema.sql"
PROD_CONTAINER=blindify-postgres

snapshot() {
  printf '%s\n' \
    "-- Structure de la base de prod de Blindz, sans aucune donnee." \
    "-- Generee par tools/schema-snapshot.sh : ne pas modifier a la main." \
    "-- Chargee par la base de test locale (npm run test:db) et par la CI." \
    ""
  # Lignes retirees pour que le fichier ne change qu'avec le schema :
  # \restrict / \unrestrict portent une cle tiree au hasard a chaque export,
  # "Dumped from/by" change a chaque mise a jour de Postgres.
  docker exec "$PROD_CONTAINER" pg_dump -U blindify --schema-only --no-owner --no-privileges blindify \
    | grep -vE '^\\(un)?restrict |^-- Dumped (from|by) '
}

case "${1:-}" in
  --check)
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    snapshot >"$tmp"
    if cmp -s "$tmp" "$OUT"; then
      echo "schema : instantane a jour"
    else
      echo "schema : la prod a derive de backend/db/schema.sql, relancer tools/schema-snapshot.sh et commiter"
      diff "$OUT" "$tmp" | head -40 || true
      exit 1
    fi
    ;;
  "")
    mkdir -p "$(dirname "$OUT")"
    snapshot >"$OUT"
    echo "ecrit : $OUT ($(grep -c '^CREATE TABLE' "$OUT") tables)"
    ;;
  *)
    echo "usage : $0 [--check]" >&2
    exit 2
    ;;
esac
