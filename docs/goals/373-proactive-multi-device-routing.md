# 373 — Proactive multi-device routing

Category: epic / feature

## Why

`docs/design/proactive-surfacing.md` ships Phases A–D. The named
remaining work: a proactive notice currently always fires through
the messaging registry, even when the user is actively at the
REPL/CLI on this machine. JARVIS-class behaviour is to surface the
notice *through the surface the user is currently looking at* — the
terminal session when present, messaging only as the fallback.

## Scope

Generalise delivery routing on top of the existing in-memory
presence tracker (Phase D). No new infra, no schema bump.

## Slices

1. **Presence-aware sink selection** — extend the proactive
   firing path so an active local presence routes the notice to a
   terminal sink instead of the messaging registry. Messaging
   remains the fallback when no local presence is recorded.
2. **Terminal notice sink** — a sink that renders a queued
   proactive notice into the active REPL without corrupting the
   prompt line (reuse the existing control-byte-safe writer).
3. **Stale-presence expiry + fallback** — presence older than a
   bounded window is treated as absent so a backgrounded terminal
   doesn't black-hole notices; falls back to messaging.

## Verify

- Per slice: `pnpm check`, `pnpm lint` (0/0), `pnpm smoke:broad`.
- `pnpm smoke:live` for the firing-path slice.
- Unit test per slice (presence → sink decision is pure logic;
  assert the sink actually chosen, no fall-back assertion).

## Status

open
