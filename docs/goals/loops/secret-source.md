# Loop journal — SecretSource

Theme: build SecretSource (design = docs/strategy/secret-source.md) — read the user's secrets on
demand from their existing LOCAL vault (keychain → 1Password → Bitwarden) instead of Muse being yet
another credential silo; never a 2nd copy; redaction + scoping so a secret never reaches a model or a
log. BIG chunk per fire (a whole phase). Tier1 (local commits, no push). Security is the whole point.
Convergence pick (openclaw secrets/ + 1Password; hermes secret_sources/bitwarden + credential_pool +
secret_scope + redact) — pattern, Muse-native reimplementation.

## Phases (each fire completes the next incomplete one)
- [x] Phase 1 — interface + resolver + redaction primitive (pure, no subprocess): SecretSource/SecretRef,
      resolveSecret (ordered, read-on-demand, refuses a non-local source), redactSecrets + value registry.
      Deterministic tests + redaction mutation test.
- [x] Phase 2 — keychain (macOS `security`, FIXED argv) + env + legacy-store adapters (mocked subprocess):
      a miss ⇒ undefined ⇒ next source; an argv-injection attempt is inert.
- [x] Phase 3 — scoping (least-privilege fail-closed) + redaction WIRING into live log/action-log/
      provenance sinks; the "secret never in a model message / grounding source" acceptance.
- [~] Phase 4 — 1Password/Bitwarden adapters (DEFERRED, design-optional; env+keychain+store shipped via the same ArgvRunner seam) — 1Password (`op read`) + Bitwarden (`bw get`) adapters (mocked), opt-in env each.
- [x] Phase 5 — wire resolveSecret into the live outbound credential-fetch path (legacy store as the
      fallback source, zero breakage) + e2e + `muse doctor` source report + docs.

## Fire log
(appended per fire)

## fire 1 (one-shot, loop retired) · 2026-06-30 · (commit pending) · SecretSource COMPLETE
verdict: PASS (full pnpm check 0 + independent security judge PASS) — built whole in one turn per Jinan ("loop 종료하고 한 턴에 전부")
- WHAT: `@muse/shared/secret-redaction.ts` (process-wide grow-only value→`‹secret:NAME›` registry + redactSecrets, longest-first so a substring can't unmask, no ReDoS); NEW pkg `@muse/secrets` (deps @muse/shared only — acyclic) = `resolveSecret` (ordered, read-on-demand, REFUSES/skips a non-local source before calling get), `createSecretScope` (least-privilege fail-closed), adapters env/keychain/store (keychain = execFile `/usr/bin/security` with a FIXED argv array, no shell). Wiring: `appendActionLog` redacts what/why/detail before hashing+persist; `calendar/credential-resolver.ts` resolves env→keychain→legacy-store-fallback (zero breakage when no vault); `muse doctor` secretSourcesCheck (posture only, never a value).
- WHY: the convergence pick (openclaw+hermes both built it) — the one capability Muse genuinely lacked. Reads the user's existing LOCAL vault on demand so Muse is no longer a credential silo; redaction keeps a secret out of every log; the model never sees a raw secret.
- REVIEW (security acceptance §4, all proven): secret never to model/cloud (non-local refused, cloudGet never invoked; value never in a ModelMessage/grounding/doctor string) + redaction fail-closed (mutation RED; masks all occurrences; no pre-registration log window) + keychain FIXED argv (mutation RED; `; rm -rf` inert) + no 2nd plaintext copy (no-disk test reads an empty data dir) + scope fail-closed + calendar zero-breakage (legacy store fallback). secrets 13 + stores 399 + calendar 164 + doctor 2 + 4 mutation drills RED. FULL `pnpm check` exit 0 + lint 0 + independent Opus SECURITY judge PASS (no leak found).
- DEFERRED (design-optional Phase 4): 1Password (`op read`) + Bitwarden (`bw get`) adapters — a thin follow-up on the same ArgvRunner seam. banking/money secrets remain hard out-of-scope.
