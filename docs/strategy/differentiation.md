# Muse differentiation ledger — where we win vs hermes / openclaw

> The `differentiation` loop's compounding artifact. Each fire researches a
> competitor capability/claim (cited), names ONE lever where Muse wins
> **structurally** (something a rival cannot copy without breaking their own
> product), and ships a verifiable code slice widening it. Rivals:
> hermes ([nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent), MIT) ·
> openclaw ([docs.openclaw.ai](https://docs.openclaw.ai/concepts/memory), MIT) — both
> free to study; we apply published mechanisms (cited), never copy proprietary code.

## Levers (newest first)

### L1 — Local-by-construction is a deterministic moat, not a config flag (fire 1)

Hermes Agent ([nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent),
MIT) and OpenClaw ([docs.openclaw.ai](https://docs.openclaw.ai/concepts/memory),
MIT) both *support* Ollama, but cloud is their default and recommended path
(Hermes's own guide names Claude Sonnet 4.6 as the best model —
[remoteopenclaw.com](https://www.remoteopenclaw.com/blog/best-models-for-hermes-agent));
"local" is a mode a user opts into, never a guarantee their code enforces.
Neither could ship a release gate that *fails the build when cloud egress
becomes possible* — such a gate would block their own product. Muse can.

Just as the grounding moat is already a numeric ratchet
(`countGroundedSurfaces` / `countGroundedCases` → `detectRegressions` fails
`self-eval` the moment a fabrication-critical surface is dropped), the
local-by-construction moat — `classifyProviderLocality` + the fail-close
`LocalOnlyViolationError` thrown in `autoconfigure-model-provider.ts` — now
earns the same `egressGuards` scoreboard ratchet (`scripts/self-eval.mjs`),
turning "cloud egress refused in code" from a tested *property* into a
mechanically-defended *invariant*: drop a gated cloud provider id or delete an
enforcement throw and `pnpm self-eval` exits 1.

Hermes likewise relies on a self-prompted "Hallucination Gate" (the model asks
*itself* whether output is grounded —
[DEV deep-dive](https://dev.to/ahmad_rrrtx/the-agent-that-writes-its-own-manual-a-deep-dive-into-hermes-agents-self-improving-architecture-58h2)),
not the deterministic cite-or-drop code Muse gates fabrication=0 with; the same
structural asymmetry holds on both moats. Neither rival has a deterministic
grounding+citation floor at all.

**Shipped:** `countEgressGuards` ratchet (value 5 = 4 gated cloud ids + 1
fail-close throw site). **Open follow-up:** widen ratchet coverage to the voice
registry cloud-key-ignore and the localhost-only embeddings guard.
