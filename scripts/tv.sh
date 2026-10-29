#!/usr/bin/env bash
# Tiwari TV on an LG TV, with LG's own developer tools (@webos-tools/cli).
#
#   bash scripts/tv.sh setup 192.168.1.50   # once: your settings, LG's tools, and the TV's key (asks the passphrase)
#   bash scripts/tv.sh install              # build the app and put it on the TV (every time you change something)
#   bash scripts/tv.sh preview              # look at it in your computer's browser
#   bash scripts/tv.sh autorenew            # keep Developer Mode from running out (renews by itself)
#   bash scripts/tv.sh phone                # the link for your phone's remote page
#   bash scripts/tv.sh helper               # let this Mac control the TV for the phone (volume, buttons, apps)
#   bash scripts/tv.sh lock                 # seal everything on your channel with a key (older setups)
#
# Before setup, on the TV: LG Content Store > Developer Mode > sign in (free LG developer account) >
# Dev Mode Status on (the TV restarts) > Key Server on.
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE=tiwari-tv
APP_ID=com.tiwari.tv

new_secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }   # 64 random hex letters

secret_of() { sed -n "s/.*secret: '\([0-9a-f]\{64\}\)'.*/\1/p" app/config.js | head -n 1; }
channel_of() { sed -n "s/.*channel: '\([^']*\)'.*/\1/p" app/config.js | head -n 1; }

config() {
  if [ ! -f app/config.js ]; then
    # A private channel name for the phone, made here so it's never in the repository.
    channel="tiwari-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"   # 24 random hex letters
    secret="$(new_secret)"
    sed -e "s/'CHANNEL'/'$channel'/" -e "s/'SECRET'/'$secret'/" config.example.js > app/config.js
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
    echo "Setting up Tiwari TV for the TV at ${ip:-?} ..."
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
  autorenew)
    STATE="$HOME/.tiwari-tv"
    PLIST="$HOME/Library/LaunchAgents/com.tiwari.tv.renew.plist"
    if [ "${2:-}" = "off" ]; then
      launchctl unload "$PLIST" 2>/dev/null || true
      rm -f "$PLIST"
      echo "Automatic renewal is off."
      exit 0
    fi
    config
    tools
    mkdir -p "$STATE"
    echo "Copying the renewal job and LG's tools to $STATE (background jobs can't use Downloads) ..."
    cp scripts/renew.sh "$STATE/renew.sh"
    channel_of > "$STATE/channel"
    secret_of > "$STATE/secret"
    chmod 600 "$STATE/secret"
    if [ ! -x "$STATE/tools/node_modules/.bin/ares-launch" ] || [ ! -d "$STATE/tools/node_modules/tweetnacl" ]; then
      npm install --silent --prefix "$STATE/tools" @webos-tools/cli@3.2.6 tweetnacl@1.0.3
    fi
    echo "Renewing now (the TV should be on) ..."
    if ! bash "$STATE/renew.sh" --now; then
      date +%s > "$STATE/devmode-renewed"
      echo "Couldn't renew right now. To be safe, press EXTEND in Developer Mode on the TV today;"
      echo "the job counts from today and renews by itself in about 25 days."
    fi
    mkdir -p "$(dirname "$PLIST")"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.tiwari.tv.renew</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$STATE/renew.sh</string></array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$STATE/renew.out</string>
  <key>StandardErrorPath</key><string>$STATE/renew.out</string>
</dict>
</plist>
PLIST
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "Automatic renewal is on: your Mac checks every hour and renews about every 25 days."
    echo "What it did: $STATE/renew.log  ·  To turn it off: bash scripts/tv.sh autorenew off"
    ;;
  lock)
    config
    if [ -n "$(secret_of)" ]; then
      echo "Your channel is already sealed with a key."
    else
      secret="$(new_secret)"
      # The key goes right after the channel line, in your private app/config.js.
      awk -v s="$secret" '{print} /^[[:space:]]*channel:/ && !done {print "  secret: '"'"'" s "'"'"',"; print "  acceptPlain: false,"; done=1}' \
        app/config.js > app/config.js.new && mv app/config.js.new app/config.js
      [ -n "$(secret_of)" ] || { echo "Couldn't add the key to app/config.js." >&2; exit 1; }
      echo "Added a key to app/config.js: everything on your channel is sealed from now on."
    fi
    echo
    echo "Now, so all three parts have the key:"
    echo "  1. bash scripts/tv.sh install     (the TV)"
    echo "  2. bash scripts/tv.sh helper      (the helper on this Mac, if you use it)"
    echo "  3. bash scripts/tv.sh autorenew   (the renewal reminder, if you use it)"
    echo "  4. bash scripts/tv.sh phone       (open the new link on each phone)"
    ;;
  helper)
    STATE="$HOME/.tiwari-tv"
    PLIST="$HOME/Library/LaunchAgents/com.tiwari.tv.helper.plist"
    if [ "${2:-}" = "off" ]; then
      launchctl unload "$PLIST" 2>/dev/null || true
      rm -f "$PLIST"
      echo "The helper is off."
      exit 0
    fi
    config
    tools
    ip="${2:-$(npx ares-setup-device -l 2>/dev/null | sed -n "s/^$DEVICE[^@]*@\([0-9.]*\):.*/\1/p" | head -n 1)}"
    channel="$(channel_of)"
    secret="$(secret_of)"
    if [ -z "$ip" ]; then echo "Run setup first (bash scripts/tv.sh setup <TV IP>), or: bash scripts/tv.sh helper <TV IP>" >&2; exit 1; fi
    node="$(command -v node)"
    mkdir -p "$STATE/helper"
    cp helper/helper.mjs helper/seal.mjs helper/package.json "$STATE/helper/"
    printf '{"host": "%s", "channel": "%s", "secret": "%s"}\n' "$ip" "$channel" "$secret" > "$STATE/helper.json"
    chmod 600 "$STATE/helper.json"
    echo "Getting the helper's TV library ..."
    (cd "$STATE/helper" && npm install --silent --omit=dev)
    echo "Pairing with the TV at $ip: the TV will ask to allow Tiwari TV Helper. Accept it with the remote."
    "$node" "$STATE/helper/helper.mjs" --pair
    mkdir -p "$(dirname "$PLIST")"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.tiwari.tv.helper</string>
  <key>ProgramArguments</key><array><string>$node</string><string>$STATE/helper/helper.mjs</string></array>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$STATE/helper.log</string>
  <key>StandardErrorPath</key><string>$STATE/helper.log</string>
</dict>
</plist>
PLIST
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "The helper is on: volume, buttons and \"Back to Tiwari TV\" work from your phone while this Mac is awake."
    echo "What it's doing: $STATE/helper.log  ·  To turn it off: bash scripts/tv.sh helper off"
    ;;
  phone)
    config
    origin="$(git remote get-url origin 2>/dev/null || true)"
    owner="$(echo "$origin" | sed -n 's#.*github.com[:/]\([^/]*\)/.*#\1#p')"
    repo="$(echo "$origin" | sed -n 's#.*github.com[:/][^/]*/\([^/.]*\).*#\1#p')"
    channel="$(channel_of)"
    secret="$(secret_of)"
    if [ -z "$secret" ]; then echo "First seal your channel with a key: bash scripts/tv.sh lock" >&2; exit 1; fi
    if [ -z "$owner" ] || [ -z "$repo" ]; then echo "This folder isn't linked to a GitHub repository." >&2; exit 1; fi
    owner="$(echo "$owner" | tr '[:upper:]' '[:lower:]')"
    echo "Open this on your phone (it's private: don't share it):"
    echo
    echo "  https://$owner.github.io/$repo/remote/#$channel.$secret"
    echo
    echo "Then Share > Add to Home Screen. (GitHub Pages must be on: repository Settings > Pages > main, / (root).)"
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
