# 212 — goal markers must not leak into user-visible CLI output

## Why

A real product-quality bug *and* a hard-constraint violation.
~28 commander strings across the CLI carried a trailing
`(goal NNN)` marker **inside `.description()` / `.option()` /
`.command()` / `.argument()`** — i.e. inside the text that
renders in `muse --help` and every `muse <cmd> --help`. A user
running `muse feeds --help` saw:

> RSS/Atom feed ingest for ambient world-state **(goal 092)**

`(goal 092)` is internal development bookkeeping; surfacing it
in product help text is noise that confuses end users and
directly violates the "no goal/round/iteration markers" hard
constraint — *worse* than the source-comment case the
in-progress comment sweep targets, because this is shipped,
user-facing output, not just source. Two more user-visible
leaks beyond the help text:

- `muse ask --help`'s `--notes-only` description (a multi-line
  `.option()` string the line-scoped pass alone wouldn't
  catch) ended with `(goal 047).`
- `muse completion bash` / `zsh` emitted
  `# muse bash completion (goal 066)` as a comment line **in
  the generated script the user installs**.

## Scope

- Line-scoped sweep across `apps/cli/src/commands-*.ts`:
  removed ` (goal NNN)` / round / iter / iteration markers
  **only** from lines containing `.description(` / `.option(`
  / `.command(` / `.argument(` (so source comments and code
  are untouched — the source-comment sweep is separate and
  already tracked). 27 files, ~28 help strings.
- Hand-fixed the two user-visible stragglers the line-scoped
  pass couldn't reach: the multi-line `--notes-only` option
  description (`commands-ask.ts`) and the bash/zsh completion
  header comments (`commands-completion.ts`).
- Behavior-preserving: every change is a help/output string
  edit only. No `.description()` semantics, no flag names, no
  logic touched. JSDoc/module-comment `Goal NNN —` markers
  (source-only, not user-visible) are intentionally left for
  the separate comment sweep.

## Verify

- `pnpm --filter @muse/cli test` — 508 pass (no regression; no
  test asserted any `(goal NNN)` help substring — verified
  before sweeping. Existing completion test checks structure,
  not the marker).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Live end-to-end (CLI output is not an LLM path → no
  smoke:live): `muse --help`, `muse feeds --help`, `muse ask
  --help`, `muse completion bash` all grep **zero** lines
  matching `goal [0-9]` — the user-visible surface is clean.

## Status

done — `muse --help`, every `muse <cmd> --help`, and the
generated shell-completion scripts no longer expose internal
goal-number bookkeeping. The user-facing CLI output now
honors the no-markers hard constraint; the source-comment
`Goal NNN —` sweep remains separately tracked.
