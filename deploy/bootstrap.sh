#!/bin/bash
# /usr/local/bin/bedlog-update.sh on every Bedlog Pi, installed by
# deploy/install.sh and run as root by bedlog-update.timer every 5 minutes.
#
# Deliberately tiny so it never has to change on a device: it fetches, then
# runs deploy/update.sh as it is on the newest origin/main. A change to the
# update logic therefore reaches every device with the push that contains
# it, with no SSH to each Pi.
#
# BEDLOG_REMOTE overrides the git remote (for testing a commit on one Pi
# before pushing it to the remote all devices follow).
set -u

export APP_DIR=/home/pi/Documents/bedlog
export REMOTE_NAME=${BEDLOG_REMOTE:-origin}
export BRANCH=main

# One run at a time, whether started by the timer or by hand.
exec 9>/run/bedlog-update.lock
flock -n 9 || { echo "Another update is running."; exit 0; }

cd "$APP_DIR" || { echo "ERROR: cannot enter $APP_DIR"; exit 1; }
git fetch --quiet "$REMOTE_NAME" "$BRANCH" || { echo "ERROR: git fetch failed."; exit 1; }
script=$(git show "$REMOTE_NAME/$BRANCH:deploy/update.sh") ||
  { echo "ERROR: $REMOTE_NAME/$BRANCH has no deploy/update.sh."; exit 1; }
exec bash -c "$script" bedlog-update
