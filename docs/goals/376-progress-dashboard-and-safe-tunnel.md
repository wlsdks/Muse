# 376 — Progress dashboard + safe tunnel

Category: epic / outward (Presence — the user can see, from anywhere,
what Muse is doing, in plain language)

## Why

The user wants to glance at "what is the loop doing right now?" from
any device, in plain language, without touching the loop PC. A
read-only HTML view, exposed through an outbound-only tunnel, with
the link pinned in the root `README.md` and kept current every
iteration.

## Non-negotiable threat model

The loop PC must never be put at risk. Therefore:

- The server (`scripts/dashboard-server.mjs`) binds to `127.0.0.1`
  only. No `0.0.0.0`, ever. No inbound port, no port-forward.
- Exactly two routes: `GET /` (HTML) and `GET /healthz`. Everything
  else 404. No file serving, no path params, no writes, no shell,
  no request-derived input to any child process.
- Exposure is **only** via a Cloudflare tunnel, which is an
  *outbound* connection from the PC to Cloudflare — it opens nothing
  inbound. The tunnel points at `127.0.0.1:<port>` and nothing else.
- If the URL leaks, a visitor sees only the rendered progress HTML.
  No repo, no shell, no other service is reachable.

## Slices

1. **Harden + test the server.** Direct unit test for the route
   table (200 `/`, `ok` `/healthz`, 404 everything else, no
   traversal), HTML-escaping test, and a `pnpm dashboard` script
   alias. (Server scaffold already committed.)
2. **Tunnel runner + setup doc.** A `scripts/dashboard-tunnel.sh`
   that runs `cloudflared tunnel --url http://127.0.0.1:<port>`
   (outbound-only) and a short doc covering the two modes:
   - **Quick tunnel** — zero account, but the URL changes each
     start (so README carries instructions, not a stable URL).
     Loop may run this unattended.
   - **Named tunnel** — stable hostname, but requires the user's
     one-time `cloudflared tunnel login` (browser auth to their
     Cloudflare account) + a Cloudflare-managed domain. **This
     step is human-gated: the loop documents it and MUST NOT
     perform the auth or expose anything until the user has done
     it and chosen the mode.**
3. **Pin the link in README + keep it current.** A fixed
   "Live progress" line in the root `README.md`; once the user
   completes the named-tunnel handoff (or accepts quick-tunnel
   semantics), the loop keeps the dashboard content current every
   iteration via clean commit subjects + `## Status` lines (the
   server renders these live, so no per-commit dashboard edit is
   needed).

## Verify

- `pnpm check` / `pnpm lint` (0/0) / `pnpm smoke:broad`.
- Server unit test (routes, escaping, localhost-only intent).
- Manual: `node scripts/dashboard-server.mjs`, confirm
  `lsof -iTCP:<port>` shows `127.0.0.1` (never `*`/`0.0.0.0`).
- Tunnel slices: do **not** mark done until the user has confirmed
  the mode and the human-gated auth step; never self-expose.

## Status

open — slice 1 server scaffold committed (`scripts/dashboard-server.mjs`,
127.0.0.1-only, routes + escaping verified manually). Remaining:
slice 1 tests + `pnpm dashboard`, slice 2 tunnel runner/doc, slice 3
README pin. Slices 2–3 blocked on the user's tunnel-mode decision
and one-time Cloudflare auth — must not self-expose before then.
