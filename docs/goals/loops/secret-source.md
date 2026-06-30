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

## fire 2 (verification round) · 2026-06-30 · (commit pending) · LEAK FIXES — "완벽에 가깝게" red-team
verdict: PASS (re-judge: all 4 gaps closed) — a hard adversarial red-team + live probes found the masking guarantee was only PARTIALLY implemented; fixed.
- FOUND (red-team + my live probes, NOT the happy-path tests): (1) HIGH — the registry redactSecrets was wired into the action-log sink ONLY; ~29 other persist sinks (chat/proactive/reminder history, messaging registry, web-action, API error, checkpoint) used the shape-only pattern matcher, so an arbitrary RESOLVED secret leaked in clear. (2) HIGH — checkpoint base64-encoded messages with NO redaction. (3) MED — scope was name-only ⇒ cross-service bypass. (4) LOW — action-log nested `detail` (type-protected, string).
- FIXED: `redactSecretsInText` (@muse/shared) now COMPOSES the registry redactSecrets after the pattern pass — every one of the 29 sinks inherits exact-value masking (no-op until a secret is registered ⇒ zero regression). `encodeCheckpointMessages` redacts BEFORE base64. `createSecretScope` is service-aware (`{name,service}` pin, fail-closed cross-service).
- REVIEW: composed-redaction + checkpoint regression tests + 2 mutation drills RED + cross-service scope test + secrets 14 + FULL `pnpm check` exit 0 (29-caller change, no regression) + lint 0 + independent Opus re-judge PASS.
- RESIDUAL (inherent, documented): redaction of a NON-credential-shaped value requires `registerSecretValue` at resolve time — the redactor can only mask values it has been told about (a secret that reaches a sink without ever being resolved through SecretSource, and has no credential shape, still leaks). This is a fundamental limit of value-based redaction, not a fixable flaw.
- lesson: a security guarantee's DOCSTRING ("every sink") must be proven by an adversarial red-team across ALL sinks, not by the happy-path unit tests of ONE sink — the builder + first judge both passed while the guarantee held in only 1 of ~30 sinks.

## fire 3 (verification round 2) · 2026-06-30 · (commit pending) · 2 MORE leaks — "한번더 진행"
verdict: PASS (red-team #2: near-airtight, no NEW leak after these fixes) — a second adversarial round at NEW angles
- CRUX CONFIRMED first: resolveSecret AUTO-registers every resolved value (registerSecretValue on a hit), so the masking guarantee isn't hollow — any secret resolved through SecretSource is masked everywhere automatically.
- FOUND + FIXED (round 2): (1) HIGH error-path leak — registration happens AFTER source.get returns, so a source whose get() THROWS with the raw secret in the message propagated it UN-registered (any upstream catch/logger would leak it). Fix: resolveSecret wraps source.get in try/catch and SWALLOWS the error → falls through to the next source (the §4 fail-open contract; an erroring vault is a miss, not a crash, and its error never propagates). (2) MED over-masking — a 1-3 char registered value masked EVERY occurrence of that substring across logs (corrupting them + revealing the value by mask density). Fix: `registerSecretValue` skips values < 4 chars (a 1-3 char value isn't a real credential; over-masking a common short substring is the worse harm).
- REVIEW: error-path fall-through test + over-masking min-length test + 2 mutation drills RED (drop the catch ⇒ propagate RED; drop the floor ⇒ over-mask RED) + secrets 15 + shared 47 + FULL `pnpm check` exit 0 (a transient SIGABRT-134 on the first run was box saturation — clean re-run green) + lint 0 + independent Opus red-team #2 PASS (keychain/empty-string/doctor-posture/floor=4 all verified clean).
- RESIDUAL (accepted, documented tradeoffs): 1-3 char secrets unmasked; a resolved value equal to a common word over-masks; an erroring vault is indistinguishable from a miss (fail-open by design); the registry is heap-inspectable; env-name normalization can collide across services. None is a fixable flaw — they are the inherent limits of value-based redaction + fail-open resolution.
