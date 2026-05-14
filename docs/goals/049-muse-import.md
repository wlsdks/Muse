# 049 — muse import <tar> — restore from export

## Why

Mirror of 048. Refuse to overwrite existing files unless --force.

## Scope

- New commands-import.ts.
- Extract to ~/.muse/ with collision detection.
- --dry-run mode prints what would change.

## Verify

- cli +2 tests (clean import; collision rejected without --force).

## Status

done — `muse import <bundle> [--dry-run] [--force]` restores a
`muse export` tarball into `~/.muse/`. Collision detection
inspects every `.muse/*` entry in the bundle against the user's
home and refuses to extract if any pre-existing file would be
overwritten, unless `--force` is passed. `--dry-run` prints the
plan with per-entry `OVERWRITE` / `create` labels without
touching disk. cli +1 round-trip unit test exercises export →
list-entries → find-collisions (clean home + conflict home) so
the contract is locked in.
