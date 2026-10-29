#!/bin/bash
# Installs the parts of the Bedlog device setup that live outside the repo.
# Run as root by update.sh on every deploy, and once by postinstall.sh when
# migrating from the old updater. Idempotent; only touches files whose
# content changed.
#   /usr/local/bin/bedlog-update.sh  <- deploy/bootstrap.sh
#   bedlog-kiosk.service drop-in     -> runs deploy/storage-repair.py before Chromium
set -u

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
changed=0

# install_file <source> <dest> <mode>
install_file() {
  if ! cmp -s "$1" "$2"; then
    install -D -m "$3" "$1" "$2.new" && mv "$2.new" "$2" || return 1
    echo "installed $2"
    changed=1
  fi
}

BIN=/usr/local/bin/bedlog-update.sh
# Keep the updater this replaces, once, in case it's ever needed again.
if [ -f "$BIN" ] && [ ! -f "$BIN.pre-bootstrap" ] && ! cmp -s "$APP_DIR/deploy/bootstrap.sh" "$BIN"; then
  cp -p "$BIN" "$BIN.pre-bootstrap"
fi
install_file "$APP_DIR/deploy/bootstrap.sh" "$BIN" 755 || exit 1

DROPIN=/etc/systemd/system/bedlog-kiosk.service.d/storage-repair.conf
tmp=$(mktemp)
cat > "$tmp" <<EOF
# Installed by $APP_DIR/deploy/install.sh. Repairs Chromium's Local Storage
# after a power cut, before Chromium opens it. "-": never blocks the kiosk.
[Service]
ExecStartPre=-/usr/bin/python3 $APP_DIR/deploy/storage-repair.py
EOF
install_file "$tmp" "$DROPIN" 644
status=$?
rm -f "$tmp"
[ $status -eq 0 ] || exit 1

[ $changed -eq 1 ] && systemctl daemon-reload
exit 0
