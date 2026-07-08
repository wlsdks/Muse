#!/usr/bin/env bash
# shot.sh — reliably screenshot a Muse desktop window, regardless of which
# display it's on OR what is in front of it. Built so an agent (or you) can drive
# the app and CAPTURE + JUDGE each window deterministically.
#
# The desktop app is a menu-bar (accessory) app whose windows scatter across
# displays and hide behind other apps, so a plain full-screen `screencapture` is
# unreliable and a region capture grabs whatever app is on top. This captures the
# target window's OWN buffer by its CGWindowID (`screencapture -l`), so it works
# even when the window is behind others or on another display.
#
# Pair with test mode for full determinism (`open -a` does NOT pass env, so run
# the executable directly):
#   MUSE_DESKTOP_TEST=1 /Applications/Muse.app/Contents/MacOS/MuseDesktop &
#   # every window → MAIN (menu-bar) display, centered; onboarding re-shows each launch
#
# Usage:
#   shot.sh --list                    list MuseDesktop windows: idx | id | WxH | pos | name
#   shot.sh --index <N> <out.png>     capture the Nth window from --list
#   shot.sh --size <WxH> <out.png>    capture the window matching that size (e.g. 440x527)
#   shot.sh --id <winid> <out.png>    capture an explicit CGWindowID
#
# Requires Screen Recording permission for the controlling terminal (System
# Settings → Privacy & Security → Screen Recording) — the same one a normal
# `screencapture` needs.
set -euo pipefail

PROC="MuseDesktop"
HELPER_SRC="$(mktemp -t muse-winlist-src).swift"
HELPER_BIN="${TMPDIR:-/tmp}/muse-winlist"

die() { echo "shot.sh: $*" >&2; exit 1; }

# Compile the tiny window-lister once (cached). It prints, for each on-screen
# MuseDesktop window: "windowNumber|x|y|w|h|name". CGWindowName may be empty
# without extra permissions — disambiguate by size, which is always available.
build_helper() {
  [ -x "$HELPER_BIN" ] && [ "$HELPER_BIN" -nt "$0" ] && return 0
  cat > "$HELPER_SRC" <<'SWIFT'
import CoreGraphics
import Foundation
// argv[1] = target owner PID (CGWindow's owner NAME is the app name "Muse", not
// the executable "MuseDesktop", so filter by PID — unambiguous, and available
// without screen-recording permission).
let targetPID = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) : nil
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let list = (CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]]) ?? []
for w in list {
    let pid = (w[kCGWindowOwnerPID as String] as? Int) ?? -1
    if let targetPID, pid != targetPID { continue }
    let num = (w[kCGWindowNumber as String] as? Int) ?? 0
    let name = (w[kCGWindowName as String] as? String) ?? ""
    let b = (w[kCGWindowBounds as String] as? [String: CGFloat]) ?? [:]
    let x = Int(b["X"] ?? 0), y = Int(b["Y"] ?? 0), ww = Int(b["Width"] ?? 0), hh = Int(b["Height"] ?? 0)
    // Skip the tiny status-item / off-screen helper layers; keep real windows.
    if ww < 80 || hh < 80 { continue }
    print("\(num)|\(x)|\(y)|\(ww)|\(hh)|\(name)")
}
SWIFT
  swiftc -O "$HELPER_SRC" -o "$HELPER_BIN" 2>/dev/null || die "failed to compile window-lister (need Xcode command line tools)"
  rm -f "$HELPER_SRC"
}

[ "$(uname)" = "Darwin" ] || die "macOS only"
PID="$(pgrep -x "$PROC" | head -1)"
[ -n "$PID" ] || die "MuseDesktop isn't running — launch Muse.app first"
build_helper

rows="$("$HELPER_BIN" "$PID")"
[ -n "$rows" ] || die "no MuseDesktop windows found (is the app showing a window?)"

if [ "${1:-}" = "--list" ]; then
  printf 'idx | id | size | pos | name\n'
  i=0
  while IFS='|' read -r id x y w h name; do
    [ -n "$id" ] || continue
    i=$((i+1))
    printf '%s | %s | %sx%s | (%s,%s) | %s\n' "$i" "$id" "$w" "$h" "$x" "$y" "$name"
  done <<< "$rows"
  exit 0
fi

MODE="${1:-}"; SEL="${2:-}"; OUT="${3:-}"
[ -n "$OUT" ] || die "usage: shot.sh (--index N | --size WxH | --id ID) <out.png>  — or --list"

winid=""
case "$MODE" in
  --index) winid="$(printf '%s\n' "$rows" | awk -F'|' -v n="$SEL" 'NR==n {print $1; exit}')" ;;
  --size)  winid="$(printf '%s\n' "$rows" | awk -F'|' -v s="$SEL" '($4"x"$5)==s {print $1; exit}')" ;;
  --id)    winid="$SEL" ;;
  *) die "unknown selector '$MODE' (use --index | --size | --id | --list)" ;;
esac
[ -n "$winid" ] || die "no window matching $MODE $SEL — run: shot.sh --list"

# -l<id> captures that window's OWN buffer (front or not); -o drops the shadow.
screencapture -x -o -l"$winid" "$OUT"
meta="$(printf '%s\n' "$rows" | awk -F'|' -v id="$winid" '$1==id {print $4"x"$5" at ("$2","$3")"; exit}')"
echo "captured window id ${winid} (${meta:-?}) → ${OUT}"
