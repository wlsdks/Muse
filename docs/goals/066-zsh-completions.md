# 066 — zsh + bash completions for muse subcommands

## Why

Generate static completion scripts via commander's built-in support.
Ship under scripts/completions/.

## Scope

- Build script.
- Install instructions in README.

## Verify

- Smoke: source the completion file in a fresh shell + tab-complete.

## Status

done — new `muse completion <bash|zsh>` subcommand emits a
static completion script for the top-level verb list. Bash form
defines `_muse_completions` + `complete -F _muse_completions
muse`; zsh form uses `#compdef muse` + `_describe -t commands`.

Verb list is enumerated dynamically from `program.commands` so
new goals automatically show up in the completion script with no
script edit. The `completion` verb itself is excluded from its
own output (no point suggesting `muse completion completion`).

Scope deviation: commander has no built-in completion generator,
so the hand-rolled scripts cover top-level verbs only — flag /
choice-value completion would need a much larger zsh `_arguments`
spec. Tab-complete-the-verb is 90% of the value for the
ergonomic cost.

Install instructions live in the subcommand's `--help` output
(redirect into `~/.bashrc` for bash, into a directory on `$fpath`
for zsh).

cli +1 test exercises bash + zsh script generation (asserts the
key structural lines + a known verb appears) and the bad-shell
error path.
