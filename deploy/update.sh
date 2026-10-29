#!/bin/bash
# Bedlog device updater. Run as root every 5 minutes by bootstrap.sh
# (/usr/local/bin/bedlog-update.sh), which fetches first and then runs this
# file as it is on the newest commit, so edits here take effect with the
# push that contains them.
#
# The new commit is installed and built in a separate worktree while the
# kiosk keeps running. The kiosk only goes down for the switch itself, after
# that has passed. A commit that fails is remembered and not retried until a
# newer one arrives, so a bad push can't put the devices in a restart loop
# (which is what the pre-2026-10-29 updater did on every failed install).
set -u

APP_DIR=${APP_DIR:-/home/pi/Documents/bedlog}
REMOTE_NAME=${REMOTE_NAME:-origin}
BRANCH=${BRANCH:-main}
STATE=/var/lib/bedlog-update
STAGE=$STATE/stage

mkdir -p "$STATE"
cd "$APP_DIR" || { echo "ERROR: cannot enter $APP_DIR"; exit 1; }

OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse "$REMOTE_NAME/$BRANCH") || { echo "ERROR: no $REMOTE_NAME/$BRANCH"; exit 1; }
deployed=$(cat "$STATE/deployed" 2>/dev/null || true)
failed=$(cat "$STATE/failed" 2>/dev/null || true)

# Device-side steps that need no restart: the schema (idempotent) and the
# files installed outside the repo (this updater's bootstrap, the kiosk's
# storage repair hook).
finish() {
  bash deploy/db-migrate.sh && bash deploy/install.sh
}

if [ "$OLD" = "$NEW" ]; then
  [ "$deployed" = "$NEW" ] && exit 0
  # The code is current but its device-side steps never completed: the first
  # run after the migration from the old updater, or a schema load that
  # failed last time. Finish them; retried every run until they pass.
  echo "Finishing deploy of $NEW..."
  if finish; then
    echo "$NEW" > "$STATE/deployed"
    echo "Done."
    exit 0
  fi
  echo "ERROR: finishing deploy of $NEW failed; will retry."
  exit 1
fi

if [ "$failed" = "$NEW" ]; then
  echo "Skipping $NEW: it failed before. Waiting for a newer commit."
  exit 0
fi

echo "New version: $OLD -> $NEW"

clean_stage() {
  git worktree remove --force "$STAGE" >/dev/null 2>&1
  rm -rf "$STAGE"
  git worktree prune
}

# Before the switch: nothing has been touched, the kiosk is still running.
give_up() {
  echo "ERROR: $1. Staying on $OLD; $NEW won't be retried."
  echo "$NEW" > "$STATE/failed"
  clean_stage
  exit 1
}

# The app and the backup service each have their own node_modules.
MODULE_DIRS=". db-backend"

# After the switch: put the old commit and its node_modules back.
roll_back() {
  echo "ERROR: $1. Rolling back to $OLD; $NEW won't be retried."
  echo "$NEW" > "$STATE/failed"
  systemctl stop bedlog-kiosk.service bedlog-vite.service
  git reset --hard "$OLD" >/dev/null
  for d in $MODULE_DIRS; do
    if [ -d "$d/node_modules.prev" ]; then
      rm -rf "$d/node_modules"
      mv "$d/node_modules.prev" "$d/node_modules"
    fi
  done
  systemctl restart bedlog-backend.service
  systemctl start bedlog-vite.service
  sleep 10
  systemctl start bedlog-kiosk.service
  exit 1
}

# Waits up to a minute for the dev server to compile the app's entry module
# (a broken import or syntax error is a 500 there, while "/" would still be
# 200) and for the backup service's health check.
healthy() {
  for _ in $(seq 1 30); do
    if curl -fs --max-time 5 -o /dev/null http://localhost:5173/src/main.tsx &&
       curl -fs --max-time 5 -o /dev/null http://localhost:4002/health; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# 1. Install and build the new commit off to the side.
clean_stage
git worktree add --detach "$STAGE" "$NEW" >/dev/null 2>&1 || give_up "checking out $NEW failed"
(cd "$STAGE" && npm ci --no-audit --no-fund) || give_up "npm ci failed"
(cd "$STAGE/db-backend" && npm ci --omit=dev --no-audit --no-fund) || give_up "npm ci failed for db-backend"
(cd "$STAGE" && npm run build) || give_up "build failed"
echo "Build passed. Switching to $NEW..."

# 2. Switch. Only now does the kiosk go down.
systemctl stop bedlog-kiosk.service bedlog-vite.service
git reset --hard "$NEW" >/dev/null
for d in $MODULE_DIRS; do
  rm -rf "$d/node_modules.prev"
  [ -d "$d/node_modules" ] && mv "$d/node_modules" "$d/node_modules.prev"
  mv "$STAGE/$d/node_modules" "$d/node_modules"
  chown -R pi:pi "$d/node_modules"  # the services run as pi; vite writes node_modules/.vite
done
clean_stage

# 3. Schema before the backup service restarts on the new code.
bash deploy/db-migrate.sh || roll_back "loading db-backend/schema.sql failed"
systemctl restart bedlog-backend.service
systemctl start bedlog-vite.service
healthy || roll_back "health check failed"

# 4. The new code is live. From here a failure is retried, never rolled back.
# Device files go in before the kiosk starts, so its storage repair hook is
# current for this start.
if bash deploy/install.sh; then
  echo "$NEW" > "$STATE/deployed"
else
  echo "WARNING: installing device files failed; the next run retries it."
fi
systemctl start bedlog-kiosk.service
for d in $MODULE_DIRS; do rm -rf "$d/node_modules.prev"; done
echo "Updated to $NEW."
exit 0
