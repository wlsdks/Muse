# 142 — `muse show` recognises Ghostty + VS Code integrated terminal

## Why

`detectInlineImageSupport` only recognised iTerm.app, WezTerm,
tabby (TERM_PROGRAM) + xterm-kitty (TERM). Two terminals that
ship the iTerm2 inline-image protocol natively were missing:

- **Ghostty** (`TERM_PROGRAM=ghostty`) — released v1.0 in late
  2024 with native iTerm2 graphics + Kitty graphics support.
  Quickly became a popular daily-driver.
- **VS Code integrated terminal** (`TERM_PROGRAM=vscode`) —
  shipped iTerm2 image protocol support in 1.93 (Aug 2024). A
  large slice of Muse users invoke the CLI inside VS Code; they
  were silently falling back to `open` / `xdg-open` instead of
  inline rendering.

## Scope

- `apps/cli/src/commands-show.ts`:
  - Replace the inline `program === "..."` chain with a
    `INLINE_IMAGE_TERM_PROGRAMS` Set so future additions land
    in one place.
  - Add `ghostty` + `vscode` to the set.
- Kitty path (`TERM=xterm-kitty`) unchanged.

## Verify

- Existing test for goal 096 extended:
  - `TERM_PROGRAM=ghostty` → `true`.
  - `TERM_PROGRAM=vscode` → `true`.
  - All previous accepts/rejects still pass.
- `pnpm --filter @muse/cli test` — 358 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — `muse show <image>` now renders inline in Ghostty and the
VS Code terminal instead of bouncing to the system viewer.
