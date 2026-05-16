# 239 — `muse export --encrypt` left the cleartext secret tarball world-readable

## Why

The export sibling of goal 238's import hardening. `--encrypt`
exists precisely to keep secrets safe at rest, yet its
intermediate step exposed them. `buildMuseExport` (encrypt path):

```ts
const tarPath = `${args.outputPath}.cleartext.tmp`;
// system `tar -c -z -f tarPath …`  → creates tarPath at 0o644
const plain = await readFile(tarPath);
await writeFile(args.outputPath, encryptExportBuffer(plain, …), { mode: 0o600 });
// finally: unlink(tarPath)
```

The bundle contains the highest-value secrets on the host —
`credentials.json`, `messaging-credentials.json`,
`calendar-credentials.json`, `models.json`. The *final* encrypted
output was correctly `0o600`, but the intermediate cleartext
tarball was created by `tar` with default perms (`0o644` under a
typical `022` umask) and only `chmod`-protected nowhere. For the
entire encrypt window (tar write + read + AES pass) a full
cleartext copy of every credential sat **world-readable** on disk.
On a shared / multi-user host another local user could read it.

The import side already writes its decrypt temp with
`writeFile(tempPath, plain, { mode: 0o600 })`
(`decryptToTempIfNeeded`) — so this was also an inconsistency: one
half of the encrypted-backup feature protected its temp, the other
half did not.

## Scope

`apps/cli/src/commands-export.ts`:

- New exported `reserveCleartextTemp(path)` —
  `writeFile(path, "", { mode: 0o600 })` then `chmod(path, 0o600)`.
  `tar -f <existing>` truncates the file *without* resetting its
  mode, so pre-creating it `0o600` means the cleartext bundle is
  owner-only for its entire lifetime, with no create→chmod race.
  The explicit `chmod` also tightens a stale temp left behind by a
  hard-killed prior run (`writeFile`'s `mode` is ignored when the
  file already exists).
- `buildMuseExport` calls it immediately before the `tar` spawn,
  guarded by `if (passphrase)`. Non-encrypt path is unchanged (the
  user explicitly chose an unencrypted backup at a path they named;
  `--encrypt` is the at-rest-secret-protection contract and the
  only place the cleartext shadow regressed). The existing
  `finally` still unlinks the temp, so failure cleanup is unchanged.

`reserveCleartextTemp` is exported for direct test coverage (same
posture as `isSafeMuseEntry` / `listMuseImportEntries`).

## Verify

- `pnpm --filter @muse/cli test` — 553 pass (was 552; +1). New
  test asserts `reserveCleartextTemp` yields `mode & 0o777 ===
  0o600` on a fresh create AND when tightening a stale `0o666`
  leftover (and that it truncates that leftover to empty).
- `pnpm check` — every workspace build+test green (apps/cli 553,
  apps/api 153, all packages).
- `pnpm lint` — exit 0.
- No real-LLM request/response path touched (this is the `tar` +
  AES backup path), so no Qwen round-trip applies.

## Status

done — a `muse export --encrypt` no longer parks a world-readable
cleartext copy of every credential on disk during the encrypt
window. The intermediate tarball is owner-only for its whole
lifetime, restoring parity with the import-side decrypt temp so
both halves of the encrypted-backup feature protect secrets at
rest consistently.
