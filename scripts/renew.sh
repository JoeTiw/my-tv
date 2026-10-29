#!/usr/bin/env bash
# Keeps the TV's Developer Mode from running out, so the TV never removes Tiwari TV.
#
# Developer Mode lasts 1000 hours (about 41 days) from the last EXTEND. macOS runs this every hour (scripts/tv.sh
# autorenew sets that up, copying this script and LG's tools to ~/.tiwari-tv, since macOS keeps background jobs
# out of Downloads); it does nothing until the last renewal is 25 days old. Then, the next time the TV is on
# and showing Tiwari TV (so no one's show is interrupted), it renews with LG's own command, which opens the
# Developer Mode app for a moment, and brings Tiwari TV back. After 33 days without a chance, it asks you (a note
# on the TV and your phone) to press EXTEND yourself.
#
#   bash ~/.tiwari-tv/renew.sh          # what macOS runs every hour
#   bash ~/.tiwari-tv/renew.sh --now    # renew now (the TV must be on)
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # launchd starts with a bare PATH

DEVICE=tiwari-tv
APP_ID=com.tiwari.tv
DEVMODE_ID=com.palmdts.devmode
STATE="$HOME/.tiwari-tv"
LAST="$STATE/devmode-renewed"
ASKED="$STATE/devmode-asked"
LOG="$STATE/renew.log"
TOOLS="$STATE/tools/node_modules/.bin"
DUE_DAYS=25
ASK_DAYS=33
mkdir -p "$STATE"

log() { echo "$(date '+%Y-%m-%d %H:%M') $*" >> "$LOG"; }

# Runs a command for at most N seconds (macOS has no `timeout`).
limit() { local s="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }

ares() { local cmd="$1"; shift; limit 60 "$TOOLS/$cmd" "$@"; }

tv_ip() {
  ares ares-setup-device -l 2>/dev/null | sed -n "s/^$DEVICE[^@]*@\([0-9.]*\):.*/\1/p" | head -n 1
}

reachable() { limit 4 bash -c "exec 3<>/dev/tcp/$1/9922" 2>/dev/null; }

foreground() {
  ares ares-novacom -d "$DEVICE" -r "luna-send-pub -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}'" 2>/dev/null \
    | sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p' | head -n 1
}

days_since() {
  local then now
  then="$(cat "$1" 2>/dev/null || echo 0)"
  now="$(date +%s)"
  echo $(( (now - then) / 86400 ))
}

renew() {
  if ! ares ares-launch -d "$DEVICE" "$DEVMODE_ID" -p '{"extend":true}' >/dev/null 2>&1; then
    log "renewal failed: the TV didn't open Developer Mode"
    return 1
  fi
  sleep 6
  ares ares-launch -d "$DEVICE" "$APP_ID" >/dev/null 2>&1 || true
  date +%s > "$LAST"
  rm -f "$ASKED"
  log "renewed Developer Mode"
  echo "Renewed Developer Mode. Next renewal in about $DUE_DAYS days."
}

# A note for the TV and the phone, through the same channel as everything else (at most once a day).
ask() {
  local channel
  channel="$(cat "$STATE/channel" 2>/dev/null)"
  [ -n "$channel" ] || return 0
  [ "$(days_since "$ASKED")" -ge 1 ] || return 0
  if curl -s -m 15 -o /dev/null -H "Title: Tiwari TV" \
      -d "Tiwari TV needs a quick renewal: on the TV, open Developer Mode and press EXTEND." \
      "https://ntfy.sh/$channel"; then
    date +%s > "$ASKED"
    log "asked for a manual EXTEND"
  fi
}

ip="$(tv_ip)"
if [ -z "$ip" ]; then log "no TV set up (run: bash scripts/tv.sh setup <IP>)"; exit 0; fi

if [ "${1:-}" = "--now" ]; then
  reachable "$ip" || { echo "The TV at $ip isn't answering. Is it on, and on the same Wi-Fi as this Mac?"; exit 1; }
  renew
  exit $?
fi

age="$(days_since "$LAST")"
[ "$age" -ge "$DUE_DAYS" ] || exit 0          # not due yet: nothing to do
if reachable "$ip" && [ "$(foreground)" = "$APP_ID" ]; then
  renew && exit 0
fi
[ "$age" -ge "$ASK_DAYS" ] && ask
exit 0
