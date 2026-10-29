#!/bin/bash
# Loads db-backend/schema.sql into the Pi's Postgres. schema.sql creates
# what's missing and upgrades older databases in place, so this is safe on
# every deploy. It connects with the backup service's own credentials (read
# from bedlog-backend.service) so new tables stay owned by that user.
set -u

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)

for kv in $(systemctl show -p Environment --value bedlog-backend.service); do
  case $kv in
    PGHOST=* | PGPORT=* | PGDATABASE=* | PGUSER=* | PGPASSWORD=*) export "$kv" ;;
  esac
done
if [ -z "${PGUSER:-}" ] || [ -z "${PGDATABASE:-}" ]; then
  echo "db-migrate: no PGUSER/PGDATABASE in bedlog-backend.service; skipping."
  exit 1
fi
export PGHOST=${PGHOST:-localhost}

PGOPTIONS='--client-min-messages=warning' \
  psql -X -q -v ON_ERROR_STOP=1 -f "$APP_DIR/db-backend/schema.sql" || {
  echo "db-migrate: loading schema.sql failed."
  exit 1
}
echo "db-migrate: schema.sql loaded into $PGDATABASE."
