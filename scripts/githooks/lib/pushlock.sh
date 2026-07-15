#!/usr/bin/env bash
# Portable push-window lock for pre-push. macOS ships NO flock(1) by default
# (util-linux only) so a mkdir-based spinlock — mkdir() is atomic on every
# POSIX filesystem — is the primary mechanism; flock(1) is used opportunistically
# when present (e.g. Linux boxes). A lock older than MUSE_PREPUSH_LOCK_TIMEOUT
# (default 600s / ~10min) is treated as abandoned (crashed holder, killed
# agent) and reclaimed rather than deadlocking every future push forever.
#
# Sourced form (used by scripts/githooks/pre-push):
#   source .../lib/pushlock.sh
#   pushlock_acquire "$lockpath" || exit 1   # blocks until acquired/timeout;
#                                             # installs an EXIT trap that
#                                             # releases the lock.
#
# Direct-invocation test entry (NOT sourced — used by
# scripts/githooks/pushlock.test.mjs to prove two concurrent invocations
# never overlap):
#   pushlock.sh <lock-path> <hold-seconds> <log-file>
#     acquires the lock, appends "start:$$" to log-file, sleeps
#     <hold-seconds>, appends "end:$$", then releases.
set -uo pipefail

MUSE_PREPUSH_LOCK_TIMEOUT="${MUSE_PREPUSH_LOCK_TIMEOUT:-600}"

pushlock_acquire() {
  local target="$1"

  if command -v flock >/dev/null 2>&1; then
    local lockfile="$target.flock"
    exec 200>"$lockfile"
    if ! flock -w "$MUSE_PREPUSH_LOCK_TIMEOUT" 200; then
      echo "pre-push: BLOCKED — could not acquire push lock (flock) within ${MUSE_PREPUSH_LOCK_TIMEOUT}s" >&2
      return 1
    fi
    return 0
  fi

  local lockdir="$target.d"
  local waited=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    local age=0
    if [ -e "$lockdir" ]; then
      local mtime
      mtime=$(stat -f %m "$lockdir" 2>/dev/null || stat -c %Y "$lockdir" 2>/dev/null || echo 0)
      age=$(( $(date +%s) - mtime ))
    fi
    if [ "$age" -gt "$MUSE_PREPUSH_LOCK_TIMEOUT" ]; then
      echo "pre-push: reclaiming stale lock at $lockdir (older than ${MUSE_PREPUSH_LOCK_TIMEOUT}s — a previous hook likely crashed)" >&2
      rm -rf "$lockdir"
      continue
    fi
    waited=$((waited + 1))
    if [ "$waited" -gt $(( MUSE_PREPUSH_LOCK_TIMEOUT * 2 )) ]; then
      echo "pre-push: BLOCKED — could not acquire push lock within $(( MUSE_PREPUSH_LOCK_TIMEOUT * 2 ))s (another agent is still running; if genuinely abandoned, remove $lockdir)" >&2
      return 1
    fi
    sleep 1
  done
  echo "$$" > "$lockdir/pid" 2>/dev/null || true
  # Heartbeat: refresh mtime while we hold the lock, so a waiter's stale-age
  # check (mtime-based) never false-reclaims a slow-but-ALIVE holder.
  ( while :; do sleep 30; touch "$lockdir" 2>/dev/null || exit 0; done ) &
  MUSE_PREPUSH_LOCK_HEARTBEAT_PID=$!
  trap 'kill "$MUSE_PREPUSH_LOCK_HEARTBEAT_PID" 2>/dev/null; rm -rf "'"$lockdir"'"' EXIT
  return 0
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  target="${1:?usage: pushlock.sh <lock-path> <hold-seconds> [log-file]}"
  hold="${2:-0}"
  logfile="${3:-/dev/null}"
  pushlock_acquire "$target" || exit 1
  echo "start:$$" >> "$logfile"
  sleep "$hold"
  echo "end:$$" >> "$logfile"
fi
