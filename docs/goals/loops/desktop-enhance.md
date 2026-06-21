# desktop-enhance — loop journal

Theme: harden & enrich the macOS desktop app (`apps/desktop`) — companion
character interaction, menu bar, Settings, self-contained server supervision,
WKWebView, bundled web UI (the app renders `apps/web` in a WebView), onboarding,
accessibility, Swift 6 concurrency, code quality, tests. Tier2 (push to
`loop/desktop-enhance` + draft PR; never auto-merge to main). Isolated worktree
`/tmp/muse-desktop-enhance`. Browser-measured UI verification (④c) on any
web/view change. Narrowest-test-only policy.

## fire 1 · 2026-06-22 · skill v2.1.0 · (pending commit)
meta: value-class=companion-interaction-quality · area=companion · kind=refactor+feature · verdict=PASS · firesSinceDrill=1
ratchet: testFiles +1 (IdleChatterTests, 9 cases) · companion×refactor 1 · fabrication 0
browser-check: n/a (Swift-only; idle chatter has no DOM render)

- **What**: extracted the idle-chatter policy out of `CompanionModel` (untestable
  @MainActor AppKit) into a pure, headless-testable `IdleChatter` enum in
  `MuseDesktopCore` — `nextCannedLine` (avoids an immediate repeat of the last
  shown line) and `acceptThought` (keeps the old empty/>160/"i'm not sure"/"잘
  모르" gates AND adds: drop punctuation-only junk, drop a near-duplicate of the
  last ≤4 shown lines). Wired in via a `recentIdle` ring buffer.
- **Why**: Jinan asked the companion to "talk more, and say its own genuine
  thoughts." More frequent chatter (already 150s→45s) feels robotic if the local
  8B keeps returning the same greeting; the dedup + no-repeat make the higher
  cadence feel alive instead of stuck.
- **Review point**: `acceptThought` is strictly stricter than the old inline
  filter (no good line newly rejected; only junk/duplicates dropped) — confirmed
  by the independent Opus ④b judge tracing OLD vs NEW.
- **Risk**: low — pure logic + additive wiring; companion bubble lifecycle
  (16s auto-clear, `lastIdleText`/`showingIdleLine`) untouched. No security
  surface.

mutation-first: breaking the avoid-repeat guard AND the dedup guard each turned a
test RED (2 failures); restored → 9/9 GREEN. ④b independent Opus judge: PASS.

## fire 2 · 2026-06-22 · skill v2.1.0 · (pending commit)
meta: value-class=settings-input-correctness · area=settings · kind=feature · verdict=PASS · firesSinceDrill=2
ratchet: testFiles +1 (apiUrl.test.ts, 7 cases) · companion×refactor 1 · settings×feature 1 · fabrication 0
browser-check: Settings — invalid(ftp)→Save disabled+error; schemeless(127.0.0.1:3030)→enabled+normalized; empty→disabled; .content bounded(≤viewport) & scrolls; nav-icon 16px; no new JS console errors

- **What**: new pure `normalizeApiBaseUrl` (apps/web/src/lib/apiUrl.ts) + 7 tests,
  wired into Settings → Save is disabled on an invalid API URL, shows an inline
  error, and saves the NORMALIZED url (adds default http:// scheme, strips
  trailing slash, rejects non-http schemes / hostless garbage).
- **Why**: the API client builds every request with `new URL(path, baseUrl)`, so
  a base typed without a scheme ("127.0.0.1:3030") silently breaks every call —
  this catches a mistyped URL at save time instead of failing every request.
- **Review point**: scheme-guard order (reject non-http → prepend http:// →
  parse → hostname check) — independent Opus ④b judge executed it (incl.
  javascript:/data: → rejected) and traced no join/display regression.
- **Risk**: low — pure helper + Settings save-path only; absolute API paths mean
  trailing-slash strip can't change request joining. No security surface.

mutation-first: removing the scheme-prepend turned 1 test RED; restored → 7/7
GREEN. ④b independent Opus judge: PASS (nit: doc-comment style → fixed).

## fire 3 · 2026-06-22 · skill v2.1.0 · (pending commit)
meta: value-class=server-resilience · area=server · kind=refactor · verdict=PASS · firesSinceDrill=3
ratchet: testFiles +1 (RestartPolicyTests, 4 cases) · companion×refactor 1 · settings×feature 1 · server×refactor 1 · fabrication 0
browser-check: n/a (Swift-only; server supervision has no DOM)

- **What**: extracted the bundled-server restart/backoff decision out of the
  untestable `ServerManager` singleton into a pure `MuseDesktopCore.RestartPolicy`
  + 4 tests, and switched LINEAR backoff (restarts×1.5) to EXPONENTIAL with a cap
  (baseDelay×2^n, capped at maxDelay) keeping the 3-restart circuit breaker.
- **Why**: a crash-looping server binary should back off fast and then stop
  hot-spinning; exponential-with-cap is the standard, and the policy is now
  unit-testable instead of buried in Process plumbing.
- **Review point**: semantic equivalence of the rewrite — still exactly 3
  restarts then give up, `restarts += 1` only on the .restart branch, breaker
  resets via ensureRunning. Independent Opus ④b judge ran 3 mutations (linearize,
  no-cap, off-by-one breaker) — all caught — and confirmed env injection / stop()
  / restart() untouched.
- **Risk**: low — pure policy + one switch in handleExit; env/Keychain plumbing
  byte-identical. No security surface.

mutation-first: linearizing the exponent turned 2 tests RED; restored → 4/4
GREEN. ④b independent Opus judge: PASS.

## fire 4 · 2026-06-22 · skill v2.1.0 · (pending commit)
meta: value-class=palette-search-quality · area=web · kind=ux · verdict=PASS · firesSinceDrill=4
ratchet: testFiles +1 (commandFilter.test.ts, 7 cases) · companion×refactor 1 · settings×feature 1 · server×refactor 1 · web×ux 1 · fabrication 0
browser-check: palette opened, 16 cmds on empty query; real-title substring "오늘"→1 (contains probe); bogus→0; live filter; no new JS console errors

- **What**: extracted the command-palette filter into a pure `rankCommands`
  (apps/web/src/components/commandFilter.ts) + 7 tests, upgrading a flat
  substring filter to ranked matching (title-prefix > title-substring > group >
  fuzzy subsequence), multi-term AND, stable tie order. Wired CommandPalette to it.
- **Why**: the old filter was substring-only and order-insensitive — "stng"
  wouldn't find "Settings", and a prefix hit didn't rank above a mid-string one.
  Better palette search = faster keyboard navigation.
- **Review point**: ranking changes result ORDER while the component's index nav
  relies on `filtered` — index resets on open and clamps on length change, length
  is stable across reorder, Enter is guarded. Independent Opus ④b judge ran the
  ranking mutation itself + tested isSubsequence directly; confirmed no false
  subsequence match and stable tie-break.
- **Risk**: low — pure helper + one useMemo swap; a11y attributes untouched. No
  security surface.

mutation-first: changing the prefix score 100→60 turned the ranking test RED;
restored → 7/7 GREEN. ④b independent Opus judge: PASS.

## fire 5 · 2026-06-22 · skill v2.1.0 · (pending commit)
meta: value-class=shipped-asset-integrity · area=tests · kind=test · verdict=PASS · firesSinceDrill=5
ratchet: testFiles +1 (MuseSpriteTests, 6 cases) · companion×refactor 1 · settings×feature 1 · server×refactor 1 · web×ux 1 · tests×test 1 · fabrication 0
browser-check: n/a (Swift unit test only)

- **What**: added the only missing MuseDesktopCore test class — MuseSpriteTests —
  validating the integrity of the SHIPPED mascot `MuseSprite.default` (rectangular
  rows, palette covers every cell, valid hexes, dims match declared w/h, animation
  override rows in range + width-matched + palette-mapped). Test-only, no source change.
- **Why**: the renderer SILENTLY skips unmapped glyphs / unparseable hexes, so a
  hand-edited ASCII-art row or a typo'd palette key would ship a holed/skewed
  mascot with no crash and nothing else catching it. MuseSprite was the last
  untested Core type.
- **Review point**: pins ACTUAL shipped data, not a fixture. Independent Opus ④b
  judge ran 5 mutations (ragged row, unmapped grid char, out-of-range mouth index,
  short override row, unmapped override char) — each caught by the precise test.
- **Risk**: none — test-only, no shipped-code change, no security surface.

EXHAUSTION note: after this, every MuseDesktopCore type has a test class — the
"add Core coverage" vein is dry; next tests-area work should target web (vitest)
or a new behavior, not more Core coverage.
lesson (process): initial pick duplicated VoiceGateTests (VoiceGate was already
tested inside PresentationTests.swift); the file-name-based untested scan missed
it. Caught at compile (redeclaration), deleted, repointed to MuseSprite. Grep for
the test CLASS, not the file name, when assessing coverage.

mutation-first: truncating a shipped grid row turned 2 tests RED; restored → 6/6
GREEN. ④b independent Opus judge: PASS.
