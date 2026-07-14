import { describe, expect, it } from "vitest";

import {
  playbookPrefetchTopK,
  RULE_BUDGET_CEILING,
  RULE_BUDGET_DEFAULT,
  ruleBudget,
  selectBehaviouralRules,
  type BehaviouralRule
} from "./behavioural-rule-budget.js";
import { strategyTextSimilarity } from "./playbook.js";

function makeRules(count: number, kind: BehaviouralRule["kind"] = "playbook"): BehaviouralRule[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    key: `rule-${String(index)}`,
    kind,
    text: `learned rule number ${String(index)} about an unrelated topic`
  }));
}

describe("ruleBudget", () => {
  it("defaults to RULE_BUDGET_DEFAULT with no env set", () => {
    expect(ruleBudget({})).toBe(RULE_BUDGET_DEFAULT);
  });

  it("MUSE_RULE_BUDGET=999 clamps to the ceiling", () => {
    expect(ruleBudget({ MUSE_RULE_BUDGET: "999" })).toBe(RULE_BUDGET_CEILING);
  });

  it("legacy MUSE_PLAYBOOK_INJECT_TOPK=100 also clamps to the ceiling", () => {
    expect(ruleBudget({ MUSE_PLAYBOOK_INJECT_TOPK: "100" })).toBe(RULE_BUDGET_CEILING);
  });

  it("MUSE_RULE_BUDGET takes priority over the legacy var", () => {
    expect(ruleBudget({ MUSE_PLAYBOOK_INJECT_TOPK: "3", MUSE_RULE_BUDGET: "5" })).toBe(5);
  });

  it("a below-1 or non-numeric override falls back to the default", () => {
    expect(ruleBudget({ MUSE_RULE_BUDGET: "0" })).toBe(RULE_BUDGET_DEFAULT);
    expect(ruleBudget({ MUSE_RULE_BUDGET: "nope" })).toBe(RULE_BUDGET_DEFAULT);
  });
});

describe("playbookPrefetchTopK — the topK 6→7 regression guard", () => {
  it("no env var: returns undefined so rankPlaybookStrategies' own default (6) applies, NOT ruleBudget()'s default (7)", () => {
    expect(playbookPrefetchTopK({})).toBeUndefined();
  });

  it("MUSE_RULE_BUDGET=999 → the clamped ceiling (10), matching an explicit override", () => {
    expect(playbookPrefetchTopK({ MUSE_RULE_BUDGET: "999" })).toBe(RULE_BUDGET_CEILING);
  });

  it("legacy MUSE_PLAYBOOK_INJECT_TOPK=100 → the clamped ceiling (10)", () => {
    expect(playbookPrefetchTopK({ MUSE_PLAYBOOK_INJECT_TOPK: "100" })).toBe(RULE_BUDGET_CEILING);
  });
});

describe("selectBehaviouralRules — budget cut", () => {
  it("40 learned rules with no turn-relevant veto: EXACTLY the default budget (7) reach the prompt", async () => {
    const rules = makeRules(40);
    const result = await selectBehaviouralRules(rules, "");
    expect(result.admitted.length).toBe(RULE_BUDGET_DEFAULT);
    expect(result.overBudget).toBe(true);
  });

  it("a bank at or below budget is unchanged in count", async () => {
    const rules = makeRules(5);
    const result = await selectBehaviouralRules(rules, "");
    expect(result.admitted.length).toBe(5);
    expect(result.overBudget).toBe(false);
  });

  it("respects an explicit budget option, clamped to the ceiling", async () => {
    const rules = makeRules(40);
    const result = await selectBehaviouralRules(rules, "", { budget: 999 });
    expect(result.admitted.length).toBe(RULE_BUDGET_CEILING);
  });
});

describe("selectBehaviouralRules — relevant-veto guarantee (safety monotonicity)", () => {
  it("a turn-relevant veto is admitted even when it would otherwise be pushed out of a small budget", async () => {
    const query = "need help booking a flight to tokyo";
    const veto: BehaviouralRule = {
      index: 0,
      key: "veto-flight",
      kind: "veto",
      text: "never suggest a budget flight without insurance"
    };
    // 6 unrelated, high-reward preferences that outscore the veto on the
    // composite (reward dominates) but share NO text with this turn's query.
    const noise: BehaviouralRule[] = Array.from({ length: 6 }, (_, i) => ({
      index: i + 1,
      key: `pref-${String(i)}`,
      kind: "pref",
      reward: 5,
      text: `completely unrelated preference statement number ${String(i)} xyzq`
    }));
    const result = await selectBehaviouralRules([veto, ...noise], query, { budget: 3 });
    expect(result.admitted.some((r) => r.key === "veto-flight")).toBe(true);
    expect(result.dropped.some((r) => r.key === "veto-flight")).toBe(false);
  });

  it("a veto with ZERO lexical relevance is still admitted — this is the one that nearly shipped", async () => {
    // The guarantee was first written as "every veto whose relevance is > 0", and
    // it dropped the veto that mattered most. Measured on the real similarity
    // function: for the query "what should I eat for lunch?", the veto "never
    // suggest anything containing peanuts — anaphylaxis" scores relevance 0.000 —
    // not one shared token. So the guarantee never fired, the veto fell to the
    // ranked cut, and ordinary playbook strategies outranked it.
    //
    // A peanut allergy IS relevant to lunch. Nothing lexical can see that, and
    // embedding cosine cannot either — it measures topic, not implication. There
    // is no cheap signal that separates a life-threatening veto from a trivial one
    // for a given turn, so we do not gate on one. Every veto goes through.
    const query = "what should I eat for lunch?";
    const veto: BehaviouralRule = {
      index: 0,
      key: "veto-peanut",
      kind: "veto",
      text: "never suggest anything containing peanuts — anaphylaxis"
    };
    expect(strategyTextSimilarity(query, veto.text)).toBe(0);

    const noise: BehaviouralRule[] = Array.from({ length: 12 }, (_, i) => ({
      index: i + 1,
      key: `pb-${String(i)}`,
      kind: "playbook",
      reward: 5,
      text: `high reward strategy number ${String(i)} xyzq`
    }));
    const result = await selectBehaviouralRules([veto, ...noise], query, { budget: 3 });
    expect(result.admitted.some((r) => r.key === "veto-peanut")).toBe(true);
    expect(result.dropped.some((r) => r.kind === "veto")).toBe(false);
  });

  it("a veto never spends a budget slot — many vetoes must not starve the learned rules", async () => {
    // Vetoes sit OUTSIDE the budget. Subtracting them from it would trade one
    // silent loss for another: a user with thirteen vetoes would get no learned
    // strategies at all. The budget bounds what Muse CHOSE to learn; a veto is
    // what the user IMPOSED, and it is not negotiable against a preference.
    const vetoes: BehaviouralRule[] = Array.from({ length: 13 }, (_, i) => ({
      index: i,
      key: `veto-${String(i)}`,
      kind: "veto",
      text: `never do the thing number ${String(i)}`
    }));
    const learned: BehaviouralRule[] = Array.from({ length: 10 }, (_, i) => ({
      index: 20 + i,
      key: `pb-${String(i)}`,
      kind: "playbook",
      reward: 3,
      text: `learned strategy number ${String(i)}`
    }));
    const result = await selectBehaviouralRules([...vetoes, ...learned], "anything", { budget: 7 });
    expect(result.admitted.filter((r) => r.kind === "veto")).toHaveLength(13);
    expect(result.admitted.filter((r) => r.kind !== "veto")).toHaveLength(7);
    expect(result.dropped.every((r) => r.kind !== "veto")).toBe(true);
  });

  it("a relevant veto is admitted even though it has a stored conflict edge against another rule", async () => {
    // The regression the previous build shipped: suppression ran BEFORE the
    // veto guarantee and deleted a turn-relevant veto. Here the veto carries a
    // (contrived) conflict edge against a higher-reward pref — it must still
    // survive, because a guaranteed veto is exempt from conflict suppression
    // entirely.
    const query = "book the $400 hotel downtown";
    const veto: BehaviouralRule = {
      conflictsWith: ["pref-hotel"],
      index: 0,
      key: "veto-hotel",
      kind: "veto",
      text: "never book a hotel over $200 without asking first"
    };
    const pref: BehaviouralRule = {
      index: 1,
      key: "pref-hotel",
      kind: "pref",
      reward: 5,
      text: "book the $400 hotel downtown whenever it comes up"
    };
    const result = await selectBehaviouralRules([veto, pref], query, { budget: 1 });
    expect(result.admitted.some((r) => r.key === "veto-hotel")).toBe(true);
    expect(result.suppressed.some((s) => s.rule.key === "veto-hotel")).toBe(false);
  });
});

describe("selectBehaviouralRules — conflict resolution from stored edges (no cosine, no model call)", () => {
  it("two rules with a stored conflict edge never both inject — the loser is named with a reason", async () => {
    const older: BehaviouralRule = { conflictsWith: ["just-schedule"], index: 0, key: "confirm-first", kind: "pref", text: "always confirm before scheduling anything" };
    const newer: BehaviouralRule = { index: 1, key: "just-schedule", kind: "pref", text: "just schedule it without asking me first" };
    const result = await selectBehaviouralRules([older, newer], "scheduling");

    const admittedKeys = new Set(result.admitted.map((r) => r.key));
    expect(admittedKeys.has("confirm-first") && admittedKeys.has("just-schedule")).toBe(false);
    // Same kind, same reward (both 0) — recency (higher index) wins: Muse's
    // forget-on-correction identity, a newer correction supersedes an older rule.
    expect(admittedKeys.has("just-schedule")).toBe(true);

    expect(result.suppressed.length).toBe(1);
    expect(result.suppressed[0]?.rule.key).toBe("confirm-first");
    expect(result.suppressed[0]?.supersededByKey).toBe("just-schedule");
    expect(result.suppressed[0]?.reason).toContain("just schedule it without asking me first");
  });

  it("a higher-priority kind (veto, irrelevant to this turn) survives a stored conflict against a lower kind (playbook)", async () => {
    const vetoRule: BehaviouralRule = { conflictsWith: ["playbook-schedule"], index: 0, key: "veto-confirm", kind: "veto", text: "always confirm before scheduling anything" };
    const playbookRule: BehaviouralRule = { index: 1, key: "playbook-schedule", kind: "playbook", text: "just schedule it without asking me first" };
    // Query shares nothing with either text, so the veto is NOT in the
    // relevance-guaranteed set here — this exercises stage-2 priority
    // resolution (veto > playbook), not the stage-1 guarantee.
    const result = await selectBehaviouralRules([vetoRule, playbookRule], "an unrelated topic entirely");

    expect(result.admitted.some((r) => r.key === "veto-confirm")).toBe(true);
    expect(result.suppressed[0]?.rule.key).toBe("playbook-schedule");
  });

  it("two COMPATIBLE rules with NO stored conflict edge both survive", async () => {
    // The previous build's failure mode: an always-conflict cosine stub
    // suppressed compatible pairs too, because nothing distinguished them from
    // real contradictions. Here neither rule carries a `conflictsWith` entry
    // naming the other, so both must be admitted.
    const a: BehaviouralRule = { index: 0, key: "lead-with-answer", kind: "pref", text: "lead with the answer" };
    const b: BehaviouralRule = { index: 1, key: "be-concise", kind: "pref", text: "be concise" };
    const result = await selectBehaviouralRules([a, b], "how should you write");
    const admittedKeys = new Set(result.admitted.map((r) => r.key));
    expect(admittedKeys.has("lead-with-answer")).toBe(true);
    expect(admittedKeys.has("be-concise")).toBe(true);
    expect(result.suppressed).toEqual([]);
  });

  it("a stub that always reports conflict=true regardless of input would fail this — proving the test depends on the actual conflictsWith data, not a fixed verdict", async () => {
    // Same two rules as the "no conflict" case above, but this time WITH a
    // stored edge — the assertion flips. If some future change made the
    // resolver ignore `conflictsWith` and always keep both (or always drop
    // one) this pair of tests would catch it in one direction or the other.
    const a: BehaviouralRule = { conflictsWith: ["be-concise"], index: 0, key: "lead-with-answer", kind: "pref", text: "lead with the answer" };
    const b: BehaviouralRule = { index: 1, key: "be-concise", kind: "pref", text: "be concise" };
    const result = await selectBehaviouralRules([a, b], "how should you write");
    const admittedKeys = new Set(result.admitted.map((r) => r.key));
    expect(admittedKeys.size).toBe(1);
    expect(result.suppressed.length).toBe(1);
  });

  it("a self-referencing or dangling conflictsWith id (candidate not in this turn's set) is ignored, not a crash", async () => {
    const rule: BehaviouralRule = { conflictsWith: ["not-in-this-set"], index: 0, key: "solo", kind: "playbook", text: "solo strategy" };
    const result = await selectBehaviouralRules([rule], "solo");
    expect(result.admitted.map((r) => r.key)).toEqual(["solo"]);
    expect(result.suppressed).toEqual([]);
  });
});
