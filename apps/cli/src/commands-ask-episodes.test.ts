import { describe, expect, it } from "vitest";

import { rankEpisodeHits } from "./commands-ask.js";

const episodes = [
  { embedding: [1, 0, 0], id: "e1", summary: "discussed the Q3 budget plan" },
  { embedding: [0, 1, 0], id: "e2", summary: "talked about a vacation in Italy" },
  { embedding: [0.9, 0.1, 0], id: "e3", summary: "reviewed the API contract" }
];

describe("rankEpisodeHits — SB-1: ground `ask` on past-session summaries", () => {
  it("ranks episodes by cosine similarity to the query and caps at top-K", () => {
    const hits = rankEpisodeHits([1, 0, 0], episodes, 2);
    expect(hits.map((h) => h.id)).toEqual(["e1", "e3"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("returns empty for no episodes or a non-positive top-K", () => {
    expect(rankEpisodeHits([1, 0, 0], [], 3)).toEqual([]);
    expect(rankEpisodeHits([1, 0, 0], episodes, 0)).toEqual([]);
  });
});
