# 325 — committed test source held raw control bytes (ZIP magic `PK\x03\x04`)

## Why

The goal-227 rule is explicit: **no raw control / zero-width /
homoglyph bytes in committed source OR docs** — adversarial or
binary test inputs must be written with escape sequences
(`\x03`) or constructed (`Buffer.from([…])` /
`String.fromCharCode(…)`), never embedded as literal bytes. The
repo even ships a pre-commit scan pattern for exactly this
(`perl -CSD … /[\x00-\x08\x0b-\x1f\x7f]…/`).

`apps/cli/test/program.test.ts` (the `encryptExportBuffer` /
`isEncryptedExportBuffer` test, goal 081) violated it in two
places:

```js
// (the two string literals below held RAW 0x03 0x04 bytes, not
//  the \x03 escapes shown here)
expect(isEncryptedExportBuffer(Buffer.from("PK\x03\x04"))).toBe(false);
expect(() => decryptExportBuffer(Buffer.from("PK\x03\x04"), "anything"))
  .toThrow(/MUSE magic/);
```

The two `Buffer.from("PK…")` literals carried the **raw bytes**
`0x50 0x4B 0x03 0x04` — the ZIP local-file-header magic — with
`0x03` (ETX, `U+0003`) and `0x04` (EOT, `U+0004`) as literal
control characters in the source file. They
were invisible in editors/Read (the string looked like
`"PK"`), so the test's intent ("a ZIP file is not a MUSE
encrypted export") was obscured, and the bytes tripped the
control-byte scan on every iteration that touched this file
(surfaced while working goal 324). It was pre-existing — not
introduced by 324 — and worth fixing on its own terms: an
established project rule violated in committed code.

## Scope

`apps/cli/test/program.test.ts` — the two `Buffer.from("PK"+raw 0x03 0x04)`
occurrences:

- Replace the raw `0x03 0x04` bytes with the **escape-sequence
  text** `\x03\x04`, byte-exact via a targeted
  `s/PK\x03\x04/PK\\x03\\x04/g` (only those two lines contain
  `PK` followed by 0x03 0x04, so the global is safe).

Runtime-identical: the JavaScript string literal
`"PK\x03\x04"` parses to the same four codepoints (`P`, `K`,
U+0003, U+0004), so `Buffer.from(...)` yields the identical ZIP
magic the test always intended. The change is purely in the
*source representation* — raw bytes → readable escape — which
both satisfies the goal-227 rule and makes the ZIP-magic intent
explicit to a reader. No production code touched.

## Verify

- `pnpm --filter @muse/cli test` — 563 pass (the goal-081
  `encryptExportBuffer` round-trip / magic-header test stays
  green; the decoded bytes are unchanged, so the
  `isEncryptedExportBuffer(...) === false` and `/MUSE magic/`
  assertions behave exactly as before).
- Full-file control-byte rescan
  (`perl -CSD … /[\x00-\x08\x0b-\x1f\x7f]|\x{200b}…/`) now
  reports **clean** — the only previously-flagged lines
  (the two raw-byte `PK` strings) are gone and none were introduced.
- `pnpm check` — every workspace green (apps/cli 563, apps/api
  161, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (test-source byte
  representation only). Deterministic test + scan are the
  rigorous verification.

## Status

done — committed test source no longer carries raw control
bytes; the ZIP local-file-header magic is now written as the
readable escape `"PK\x03\x04"`, the goal-227 rule holds across
the file, and the pre-commit control-byte scan is clean. Test
behaviour is byte-identical.
