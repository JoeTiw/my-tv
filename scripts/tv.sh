#!/usr/bin/env bash
# Tiwari TV on an LG TV, with LG's own developer tools (@webos-tools/cli).
#
#   bash scripts/tv.sh setup 192.168.1.50   # once: your settings, LG's tools, and the TV's key (asks the passphrase)
#   bash scripts/tv.sh install              # build the app and put it on the TV (every time you change something)
#   bash scripts/tv.sh preview              # look at it in your computer's browser
#
# Before setup, on the TV: LG Content Store > Developer Mode > sign in (free LG developer account) >
# Dev Mode Status on (the TV restarts) > Key Server on.
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE=tiwari-tv
APP_ID=com.tiwari.tv

config() {
  if [ ! -f app/config.js ]; then
    # A private channel name for the phone, made here so it's never in the repository.
    channel="tiwari-$(LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 24)"
    sed "s/'CHANNEL'/'$channel'/" config.example.js > app/config.js
    echo "Made app/config.js (it stays on this computer). Add your keys there."
    echo "Your phone channel: https://ntfy.sh/$channel"
  fi
}

tools() {
  if ! command -v node >/dev/null; then
    echo "Node.js is needed for LG's tools. On a Mac: brew install node" >&2
    exit 1
  fi
  if [ ! -x node_modules/.bin/ares-package ]; then
    echo "Getting LG's webOS tools ..."
    npm install --silent
  fi
}

case "${1:-}" in
  setup)
    ip="${2:-}"
    if [ -z "$ip" ]; then echo "Usage: bash scripts/tv.sh setup <TV IP address>" >&2; exit 2; fi
    config
    tools
    npx ares-setup-device -R >/dev/null 2>&1 || true
    npx ares-setup-device -a "$DEVICE" -i "username=prisoner" -i "host=$ip" -i "port=9922" -i "default=true"
    echo "Now the TV's key: type the passphrase shown in Developer Mode on the TV."
    npx ares-novacom -d "$DEVICE" --getkey
    echo "Set up. Next: bash scripts/tv.sh install"
    sed -n "s/.*channel: '\(.*\)'.*/Phone channel: https:\/\/ntfy.sh\/\1/p" app/config.js
    ;;
  install)
    config
    tools
    rm -rf out && mkdir -p out
    npx ares-package app -o out
    npx ares-install -d "$DEVICE" out/*.ipk
    npx ares-launch -d "$DEVICE" "$APP_ID"
    echo "Installed and open on the TV."
    echo "Developer Mode lasts about 40 days: open the Developer Mode app on the TV now and then and press EXTEND."
    ;;
  preview)
    config
    echo "Open http://localhost:8000 (Ctrl+C to stop). Arrow keys, Enter and Escape act as the remote."
    cd app && python3 -m http.server 8000
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 2
    ;;
esac
