import { describe, expect, it } from "vitest";

import { validateUmbrellaCoverage } from "../src/skill-merge-gate.js";

// Deterministic fake embedder: maps each text to a 2-D unit vector at a chosen
// angle, so pairwise cosine is exactly cos(Δangle) — no Ollama needed. The
// umbrella sits at 0°; a "covered" skill is near it, a "lost" skill is far.
function fakeEmbed(text: string): Promise<readonly number[]> {
  let deg: number;
  if (text.includes("lost")) deg = 85; // cos 85° ≈ 0.09  → below floor
  else if (text.includes("near")) deg = 40; // cos 40° ≈ 0.77 → above default floor, below 0.8
  else if (text.includes("cov")) deg = 12; // cos 12° ≈ 0.98 → well covered
  else deg = 0; // the umbrella
  const r = (deg * Math.PI) / 180;
  return Promise.resolve([Math.cos(r), Math.sin(r)]);
}

const opt = { embed: fakeEmbed };

describe("validateUmbrellaCoverage (semantic)", () => {
  const umbrella = { name: "umbrella-skill", description: "Use when handling the cluster", body: "steps" };

  it("accepts an umbrella that semantically covers every clustered skill", async () => {
    const cluster = [
      { name: "cov-a", description: "Use when doing A", body: "x" },
      { name: "cov-b", description: "Use when doing B", body: "y" },
      { name: "cov-c", description: "Use when doing C", body: "z" }
    ];
    const verdict = await validateUmbrellaCoverage(cluster, umbrella, opt);
    expect(verdict.accept).toBe(true);
    expect(verdict.lost).toEqual([]);
    expect(verdict.score).toBe(1);
  });

  it("REJECTS an umbrella that drops one skill's purpose (semantic miss)", async () => {
    const cluster = [
      { name: "cov-a", description: "Use when doing A", body: "x" },
      { name: "cov-b", description: "Use when doing B", body: "y" },
      { name: "lost-c", description: "Use when doing an unrelated thing", body: "z" }
    ];
    const verdict = await validateUmbrellaCoverage(cluster, umbrella, opt);
    expect(verdict.accept).toBe(false);
    expect(verdict.lost).toEqual(["lost-c"]);
    expect(verdict.score).toBeCloseTo(2 / 3);
    expect(verdict.reason).toContain("lost-c");
  });

  it("accepts a loosely-generalised umbrella above the floor (40° ≈ 0.77 ≥ 0.65)", async () => {
    const cluster = [{ name: "near-a", description: "Use when doing A", body: "x" }];
    const verdict = await validateUmbrellaCoverage(cluster, umbrella, opt);
    expect(verdict.accept).toBe(true);
    expect(verdict.covered).toEqual(["near-a"]);
  });

  it("a higher floor can reject the same loose generalisation", async () => {
    const cluster = [{ name: "near-a", description: "Use when doing A", body: "x" }];
    const verdict = await validateUmbrellaCoverage(cluster, umbrella, { embed: fakeEmbed, floor: 0.85 });
    expect(verdict.accept).toBe(false);
    expect(verdict.lost).toEqual(["near-a"]);
  });

  it("requireAllCovered=false accepts a partial merge above minScore", async () => {
    const cluster = [
      { name: "cov-a", description: "Use when doing A", body: "x" },
      { name: "cov-b", description: "Use when doing B", body: "y" },
      { name: "lost-c", description: "Use when doing an unrelated thing", body: "z" }
    ];
    const verdict = await validateUmbrellaCoverage(cluster, umbrella, {
      embed: fakeEmbed,
      minScore: 0.6,
      requireAllCovered: false
    });
    expect(verdict.accept).toBe(true); // 2/3 ≥ 0.6
    expect(verdict.lost).toEqual(["lost-c"]);
  });

  it("is FAIL-CLOSED: an embedder error rejects (cannot verify ⇒ do not commit)", async () => {
    const cluster = [{ name: "cov-a", description: "Use when doing A", body: "x" }];
    const verdict = await validateUmbrellaCoverage(cluster, umbrella, {
      embed: () => Promise.reject(new Error("ollama down"))
    });
    expect(verdict.accept).toBe(false);
    expect(verdict.lost).toEqual(["cov-a"]);
    expect(verdict.reason).toContain("embedder unavailable");
  });

  it("an empty cluster never accepts", async () => {
    const verdict = await validateUmbrellaCoverage([], umbrella, opt);
    expect(verdict.accept).toBe(false);
    expect(verdict.score).toBe(0);
  });
});
