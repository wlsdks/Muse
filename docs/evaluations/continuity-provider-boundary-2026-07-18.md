# Continuity provider-boundary evaluation — 2026-07-18

## Claim under test

An `ExactArtifactResolver` result may supply changing display prose, but it may
not change the user-authored link's artifact id, type, provider, or role. A
mismatch must fail before delivery persistence. `undefined` remains unavailable
and a resolver exception remains an exception.

## Deterministic evaluation

```sh
pnpm eval:continuity-provider-boundary -- --cases 10000
```

The fixed-seed run (`1129333297`) exercised:

- all 126 public signatures from seven resolution outcomes, three provider
  shapes, three fault positions, and preview/open surfaces;
- 10,000 core cases with all 63 core signatures represented and 9,937 duplicate
  samples;
- minimum bins of 1,362 per fault, 3,245 per position, and 3,332 per provider;
- Korean/English, whitespace, Unicode, and injection-like title/summary changes;
- unrelated thread, delivery/outcome, receipt, reset, and undo-reset additions
  and reordering, including a newer explicit unrelated `rejected` outcome;
- identity-blind, unavailable-laundering, and display-coupled counterfactual
  mutants. The display mutant changes prose and counterfactually drifts the
  normal projected policy field, then the same default scoring projection used
  by core stress detects it; no alternate projection is injected.

Result: `mismatchOmissions=0`, `controlDrift=0`,
`evidenceLaundering=0`, `oracleMismatches=0`, and `publicSurfaceFailures=0`.
Late mismatch/throw cases first resolved earlier links, then proved exact file
bytes and zero `idFactory` calls after failure.
The artifact validator also requires the fault, provider, and position bin
counts each to sum exactly to the declared core case count; mutation tests cover
missing, below-minimum, and non-conserving bins separately.

Raw cases and the machine-readable summary are generated only at
`.muse-dev/evals/continuity-provider-boundary/` (`cases.jsonl` and
`summary.json`). The directory is git-ignored.

## Boundary

This is synthetic provider-boundary evidence, not natural product evidence. It
does not write the default or environment-selected Attunement file, call a real
provider or network, create outcomes, change policy, or expand permission.
Display text is deliberately excluded from the control-plane projection; raw
provider prose is not declared trusted by this evaluation.
