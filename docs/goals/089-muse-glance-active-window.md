# 089 — `muse glance` — active-window awareness (macOS)

## Why

JARVIS knows which workshop terminal Tony is staring at. Muse has
no ambient screen awareness — every query starts from zero
context. Add `muse glance` (macOS only, like the existing
`MacosNotificationProvider`) that returns the frontmost app, the
active window title, and any selected text via `osascript`. Pure
shell-out, no extra dep.

## Scope

- New `apps/cli/src/commands-glance.ts`.
- `muse glance [--json]` calls `osascript -e '...'` to get:
  - frontmost app name
  - frontmost window title
  - currently-selected text (via Accessibility API; soft-fail when
    not granted — surfaces an empty `selected` field instead of
    erroring).
- Exit cleanly on non-macOS with a one-line hint
  ("muse glance requires macOS — Linux/Windows support is a
  follow-up").

## Verify

- cli +1 unit test on the pure parser that turns osascript's
  newline-delimited output into `{ app, window, selected }`.
- Dogfood (skip on non-darwin):
  ```
  if [ "$(uname)" = "Darwin" ]; then
    node apps/cli/dist/index.js glance --json
  fi
  ```
  Pass if JSON contains a non-empty `app` field.

## Status

done — `muse glance [--json]` shells out to `osascript` and
returns `{ app, window, selected }`. Selected-text capture
uses an AppleScript Cmd-C fallback (no native Accessibility
API binding); the script swallows failures so missing
permissions degrade to empty `selected` while `app` + `window`
still surface.

Scope deviation: the original "Accessibility API" approach
would need a native Swift bridge. Cmd-C fallback covers the
common case (text selected in any focused app) with zero
native deps. Side effect: when nothing is selected, the user's
clipboard contents land in `selected` — documented in the
help text.

Pure parser `parseOsascriptGlance` normalises AppleScript's
literal `"missing value"` + whitespace to empty strings.
Non-darwin → stderr hint + exit 1.

cli +1 unit test on the pure parser (happy / missing-value /
whitespace / empty). Dogfood on this macOS host hit the live
`osascript` path; JSON returned `app: "Google Chrome"` —
non-empty, matches the pass criterion.
