import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Grounding / faithfulness batteries measure the fabrication floor via REAL
 * retrieval, so they MUST embed with the PRODUCTION default — the same embedder
 * the product ships (DEFAULT_EMBED_MODEL = nomic-embed-text-v2-moe). fire 56: one
 * battery left on the legacy EN-centric v1 (~50% KO hit@1) measured a Korean
 * "coverage gap" the product never ships and blocked EVERY push as a false
 * fabrication-floor breach. This guard locks the invariant across the grounding
 * batteries so the next embedder upgrade can't silently leave one behind.
 *
 * NOT covered (intentional): eval-embedder-ab.mjs (A/B-compares both embedders),
 * the self-improving batteries (skill/preference/playbook merge — not grounding),
 * verify-local-first.mjs (env-driven), smoke-live-llm.mjs (presence check).
 */
const GROUNDING_BATTERIES = [
  "apps/cli/scripts/verify-faithfulness-rate.mjs",
  "apps/cli/scripts/verify-grounding-delta.mjs",
  "apps/cli/scripts/verify-grounding-delta-squad.mjs",
  "apps/cli/scripts/verify-cited-recall.mjs",
  "apps/cli/scripts/verify-rubric-gate.mjs",
  "apps/cli/scripts/verify-chat-grounding-rate.mjs",
  "apps/cli/scripts/verify-proactive-recall-gate.mjs",
  "apps/cli/scripts/verify-council-self-abstention.mjs"
];

for (const rel of GROUNDING_BATTERIES) {
  test(`grounding battery embeds with the PRODUCTION default (DEFAULT_EMBED_MODEL): ${rel}`, () => {
    const src = readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /DEFAULT_EMBED_MODEL/u, `${rel} must read DEFAULT_EMBED_MODEL, not hardcode an embedder`);
    // The legacy literal as an embedder default/const is the fire-56 bug. The
    // negative lookahead keeps `nomic-embed-text-v2-moe` (the production value)
    // from matching, so only the bare legacy literal trips this.
    assert.doesNotMatch(
      src,
      /(\?\?|=)\s*"nomic-embed-text"(?!-)/u,
      `${rel} hardcodes the legacy 'nomic-embed-text' embedder — use DEFAULT_EMBED_MODEL (the product ships v2-moe)`
    );
  });
}
