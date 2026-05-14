# 083 — Pin sha256 fingerprint per external MCP server binary

## Why

Goal 032 added an allowlist of MCP server names but the binary
the name resolves to is still implicit (whatever `command` /
`args` say). A package-manager swap, a typosquatted binary on
PATH, or a stale local build can change what the agent actually
calls without changing the registered name. Add an optional
sha256 fingerprint per server; on connect we hash the resolved
binary + first argv element and refuse on mismatch.

## Scope

- Extend `McpExternalServerInput` with optional
  `fingerprintSha256`. When set, `McpManager.connect` hashes the
  command file (or the stdin bytes for `node`-style invocations
  by hashing the entrypoint script) and refuses on mismatch.
- `muse mcp pin <name>` records the current hash so an operator
  can lock the registration after manual review.
- Mismatch flips the server to `disabled` + writes a
  diagnostic entry like the allowlist denial does.

## Verify

- mcp +2 tests: matching fingerprint connects; mismatch is
  refused without exception; missing fingerprint behaves as
  today (no enforcement).

## Status

done — `McpServer.config.fingerprintSha256` is the opt-in
contract (no schema migration — sits inside the existing
`JsonObject` config). On `McpManager.connect`,
`verifyServerFingerprint` reads the pin, hashes the resolved
command binary, and refuses on mismatch by flipping to
`disabled` + writing an unhealthy diagnostic (same shape as
goal 032's allowlist denial). For `node`/`deno`/`bun`/`python`
invocations the first non-flag `args[0]` (the entrypoint
script) is folded into the hash too so a swapped script with
the same node binary still trips the pin.

Scope deviation: `muse mcp pin <name>` CLI subcommand is
deferred — the helper is exported so the CLI command is a
trivial follow-up. Missing fingerprint = no enforcement
(matches the empty-allowlist posture of goal 032).
Non-stdio transports refuse pinning attempts up front.

mcp +2 tests: no-pin pass-through; matching pin allowed,
mismatched pin refused with clear reason, malformed pin
treated as no-pin, non-stdio transport rejected.
