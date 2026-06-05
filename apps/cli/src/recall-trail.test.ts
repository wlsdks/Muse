import { describe, expect, it } from "vitest";

import { coreShellRanking, depositCoRecall, emptyTrails, topCoRecalled } from "./recall-trail.js";

const NOW = 1_700_000_000_000;
const day = 86_400_000;

describe("depositCoRecall", () => {
  it("deposits on every unordered pair of co-recalled notes and accumulates on repeat", () => {
    let trails = depositCoRecall(emptyTrails(), ["a.md", "b.md", "c.md"], NOW);
    // 3 notes → 3 edges (a-b, a-c, b-c)
    expect(Object.keys(trails.trails)).toHaveLength(3);
    // recall a+b again → that edge strengthens, the others don't
    trails = depositCoRecall(trails, ["a.md", "b.md"], NOW);
    expect(topCoRecalled(trails, "a.md", NOW)[0]).toEqual({ noteId: "b.md", strength: 2 });
    expect(topCoRecalled(trails, "a.md", NOW).find((p) => p.noteId === "c.md")?.strength).toBe(1);
  });

  it("is a no-op for fewer than two distinct notes (a single hit deposits nothing)", () => {
    expect(depositCoRecall(emptyTrails(), ["a.md"], NOW).trails).toEqual({});
    expect(depositCoRecall(emptyTrails(), ["a.md", "a.md"], NOW).trails).toEqual({}); // deduped
    expect(depositCoRecall(emptyTrails(), [], NOW).trails).toEqual({});
  });

  it("caps a single edge's weight so a hot pair can't dominate forever", () => {
    let trails = emptyTrails();
    for (let i = 0; i < 100; i += 1) trails = depositCoRecall(trails, ["a.md", "b.md"], NOW, { cap: 50 });
    expect(topCoRecalled(trails, "a.md", NOW)[0]!.strength).toBe(50);
  });
});

describe("topCoRecalled — evaporation-weighted partners, strongest first", () => {
  it("decays a trail by its half-life since the last deposit and ranks by current strength", () => {
    const trails = depositCoRecall(depositCoRecall(emptyTrails(), ["a.md", "b.md"], NOW - 30 * day), ["a.md", "c.md"], NOW);
    // a-b: weight 1 deposited 30 days ago, 30-day half-life → ~0.5; a-c: weight 1 now → 1.0
    const partners = topCoRecalled(trails, "a.md", NOW, { halfLifeMs: 30 * day });
    expect(partners.map((p) => p.noteId)).toEqual(["c.md", "b.md"]); // fresher c outranks decayed b
    expect(partners[1]!.strength).toBeCloseTo(0.5, 5);
  });

  it("drops trails that have evaporated below minStrength, and honours the limit", () => {
    const trails = depositCoRecall(emptyTrails(), ["a.md", "b.md"], NOW - 300 * day); // long-decayed
    expect(topCoRecalled(trails, "a.md", NOW, { halfLifeMs: 30 * day, minStrength: 0.05 })).toEqual([]);
    const wide = depositCoRecall(emptyTrails(), ["a.md", "b.md", "c.md", "d.md"], NOW);
    expect(topCoRecalled(wide, "a.md", NOW, { limit: 2 })).toHaveLength(2);
  });
});

describe("coreShellRanking — k-shell decomposition surfaces structural hubs", () => {
  const edge = (trails: ReturnType<typeof emptyTrails>, a: string, b: string) => depositCoRecall(trails, [a, b], NOW);

  it("ranks a 2-core (triangle) STRICTLY above pendant notes (k-shell 2 vs 1)", () => {
    // triangle a-b-c (2-core) + pendant d-a + pendant e-d
    let t = depositCoRecall(emptyTrails(), ["a.md", "b.md", "c.md"], NOW); // triangle
    t = edge(t, "a.md", "d.md");
    t = edge(t, "d.md", "e.md");
    const ranked = coreShellRanking(t, NOW);
    const shellOf = (id: string) => ranked.find((r) => r.noteId === id)!.shell;
    expect(shellOf("a.md")).toBe(2);
    expect(shellOf("b.md")).toBe(2);
    expect(shellOf("c.md")).toBe(2);
    expect(shellOf("d.md")).toBe(1);
    expect(shellOf("e.md")).toBe(1);
    expect(ranked[0]!.shell).toBe(2); // a hub leads
  });

  it("the discriminating test: a dense clique node outranks a HIGH-DEGREE star centre (k-shell ≠ degree)", () => {
    // star: hub H joined to 5 leaves (H degree 5, but shell 1) ...
    let t = emptyTrails();
    for (const leaf of ["l1.md", "l2.md", "l3.md", "l4.md", "l5.md"]) t = edge(t, "H.md", leaf);
    // ... plus a separate triangle clique x-y-z (each degree 2, shell 2)
    t = depositCoRecall(t, ["x.md", "y.md", "z.md"], NOW);
    const ranked = coreShellRanking(t, NOW);
    const shellOf = (id: string) => ranked.find((r) => r.noteId === id)!.shell;
    const degreeOf = (id: string) => ranked.find((r) => r.noteId === id)!.degree;
    expect(degreeOf("H.md")).toBe(5); // highest degree by far
    expect(shellOf("H.md")).toBe(1); // ...but shallow shell
    expect(shellOf("x.md")).toBe(2); // clique is the deep core
    // the clique (shell 2) outranks the high-degree star centre (shell 1) — the paper's whole point
    expect(ranked[0]!.shell).toBe(2);
    expect(ranked.findIndex((r) => r.noteId === "x.md")).toBeLessThan(ranked.findIndex((r) => r.noteId === "H.md"));
  });

  it("excludes a long-decayed edge so it can't inflate a shell, and returns [] on an empty graph", () => {
    const day = 86_400_000;
    let t = depositCoRecall(emptyTrails(), ["a.md", "b.md", "c.md"], NOW); // triangle now
    t = depositCoRecall(t, ["c.md", "d.md"], NOW - 300 * day); // ancient edge (evaporated)
    const ranked = coreShellRanking(t, NOW, { halfLifeMs: 30 * day });
    expect(ranked.find((r) => r.noteId === "d.md")).toBeUndefined(); // decayed edge dropped
    expect(coreShellRanking(emptyTrails(), NOW)).toEqual([]);
  });
});
