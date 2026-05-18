#!/usr/bin/env bash
# Expose the read-only dashboard via a Cloudflare QUICK tunnel.
#
# Safety (the loop PC must never be at risk):
#   - cloudflared quick tunnel is an OUTBOUND connection. It opens
#     no inbound port and forwards ONLY http://127.0.0.1:$PORT,
#     which itself is the read-only dashboard (GET / and /healthz).
#   - No account, no login, no domain. Public-by-URL is the chosen
#     posture; the dashboard exposes nothing but the progress HTML.
#   - The ephemeral *.trycloudflare.com URL rotates each start, so
#     the runner splices the current URL into README.md between the
#     LIVE_URL markers; the loop commits that one-line change.
set -euo pipefail

PORT="${MUSE_DASHBOARD_PORT:-8787}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
readme="$repo/README.md"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. One-time, no account needed:" >&2
  echo "  macOS:  brew install cloudflared" >&2
  echo "  other:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

if ! curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  node "$here/dashboard-server.mjs" &
  for _ in $(seq 1 20); do
    curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

write_url() {
  local url="$1"
  [ -f "$readme" ] || return 0
  REPL="📊 **Live progress:** <$url> — read-only, auto-refreshing view of what the loop is doing. URL rotates on restart; the loop keeps this line current." \
    perl -0pi -e 's{<!--LIVE_URL-->.*?<!--/LIVE_URL-->}{<!--LIVE_URL-->$ENV{REPL}<!--/LIVE_URL-->}s' "$readme"
  echo "live URL written to README: $url" >&2
}

cloudflared tunnel --url "http://127.0.0.1:$PORT" 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" =~ https://[a-z0-9-]+\.trycloudflare\.com ]]; then
    write_url "${BASH_REMATCH[0]}"
  fi
done
