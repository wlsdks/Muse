# 328 — the goal-227 byte-hygiene rule had no enforcement; lock it with a test

## Why

Goals 325 / 326 / 327 cleared every raw control / zero-width /
BOM byte from committed source and docs, and the repo-wide scan
is fully clean. But the goal-227 rule has *always* described
itself as a "pre-commit scan" — and there is **no pre-commit
scan**: no husky, no `.husky/`, no lint-staged, no CI step, no
test. The scan was run by hand each iteration. The three
iterations of cleanup will silently regress the moment anyone
pastes a zero-width character into a doc or a control byte into
a fixture, with nothing to catch it.

The project's own contract is unambiguous: "Tests are the only
form of verification." A rule with no test is not enforced. The
highest-leverage move after closing the class is to make it
**stay** closed.

## Scope

New `packages/shared/test/repo-byte-hygiene.test.ts` — a single
deterministic test (runs inside `pnpm check`, no CI / git-hook
change):

- `git -C <repoRoot> ls-files` → filter to the goal-227
  extension set (`ts tsx js mjs cjs md json rs`) → read each →
  flag any `0x00–0x08`, `0x0b–0x1f`, `0x7f`, `U+200B/200C/200D`,
  `U+FEFF`. Detection is a **code-point predicate**, not a regex
  character class — so the test file itself carries no raw
  bytes and trips neither goal-227 nor ESLint
  `no-misleading-character-class` (the regex-class form was
  rejected for exactly that lint reason during this iteration).
- On failure it lists every offending `path:line` with the
  remediation (`\xNN` / `String.fromCharCode` / `U+NNNN`).
- A `files.length > 200` floor (actual: 1022 tracked text
  files) guards against the worst failure mode of an
  enforcement test — a wrong `repoRoot` / empty `git ls-files`
  scanning nothing and passing vacuously, giving false
  confidence.

`@muse/shared` is the right home: the lowest-level,
dependency-free workspace, and the one that already owns
repo-wide utilities (redaction, hashing, `truncateErrorBody`).
`fileURLToPath`-derived `repoRoot` + `git -C` make it
cwd-independent.

## Verify

- `pnpm --filter @muse/shared test` — green (the new hygiene
  test + existing shared tests). The test passes because the
  repo is clean post-327; it now *fails the build* on any future
  regression.
- Self-scan: `repo-byte-hygiene.test.ts` itself has zero
  forbidden bytes (predicate built from numeric code points, no
  raw bytes, no escaped-class).
- `pnpm check` — every workspace green (apps/cli 563, apps/api
  161, all packages). `pnpm lint` — exit 0 (the
  `no-misleading-character-class` error from the initial
  regex-class draft was resolved by switching to the code-point
  predicate; root cause fixed, not suppressed).
- No real-LLM request/response path touched (repo-hygiene
  meta-test). The deterministic test is itself the verification.

## Status

done — the goal-227 raw-byte rule is now enforced by a
deterministic test that fails `pnpm check` on any control /
zero-width / BOM regression across all 1022 tracked source/doc
files. The hygiene class closed in 325 → 326 → 327 can no longer
silently regress, and the rule the codebase always *described*
as a pre-commit scan finally has teeth.
