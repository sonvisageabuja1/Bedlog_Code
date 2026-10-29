#!/bin/sh
# npm "postinstall". Does nothing anywhere except a Bedlog Pi that is still
# on the updater from before 2026-10-29 (/usr/local/bin/bedlog-update.sh
# with its own logic), running `npm install` as root in the app directory.
#
# There, this is the one-time migration. That updater only knows how to
# reset to origin/main, npm install, build and restart, so a push can only
# replace it from inside `npm install`. It loads the schema (the updater
# restarts the backup service on the new code next) and installs the new
# bootstrap and kiosk storage repair. Once the bootstrap is in place,
# update.sh does all of this itself and this script stays silent.
#
# Always exits 0: a failure here must not make the old updater roll back.
[ "$(uname -s)" = Linux ] || exit 0
[ "$(id -u)" = 0 ] || exit 0
APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
[ "$APP_DIR" = /home/pi/Documents/bedlog ] || exit 0
[ -f /usr/local/bin/bedlog-update.sh ] || exit 0
cmp -s "$APP_DIR/deploy/bootstrap.sh" /usr/local/bin/bedlog-update.sh && exit 0

echo "bedlog: migrating this device to the repo-managed updater..."
bash "$APP_DIR/deploy/db-migrate.sh" || echo "bedlog: schema load failed; update.sh retries it."
bash "$APP_DIR/deploy/install.sh" || echo "bedlog: installing the updater failed."
exit 0
