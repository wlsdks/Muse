import { describe, expect, it } from "vitest";

import { extractFollowupPromises, hasCommissiveForce, hasKoreanCommissiveForce } from "../src/index.js";

const now = new Date("2026-06-14T10:00:00.000Z");
// requireCommissive:true mirrors what the production capture hook passes.
const kinds = (text: string): string[] =>
  extractFollowupPromises(text, { now, requireCommissive: true }).map((p) => p.kind);

const kindsUngated = (text: string): string[] =>
  extractFollowupPromises(text, { now }).map((p) => p.kind);

// Speech-act commissive force (arXiv:2502.14321): a SELF-followup is a commissive
// act (the assistant commits to a future action). A descriptive time mention with
// no first-person commitment ("your meeting is tomorrow") is an illocutionary
// misfire — capturing it queues a reminder the assistant never promised.

describe("hasCommissiveForce", () => {
  it("true when a first-person commitment governs the time phrase's sentence", () => {
    const t = "I'll check the report tomorrow morning.";
    expect(hasCommissiveForce(t, t.indexOf("tomorrow"))).toBe(true);
  });

  it("true when the commitment FOLLOWS the time phrase in the same sentence", () => {
    const t = "In 30 minutes I'll ping you.";
    expect(hasCommissiveForce(t, t.toLowerCase().indexOf("in 30"))).toBe(true);
  });

  it("false for a descriptive/assertive sentence (no commitment)", () => {
    const t = "Your meeting is tomorrow at 3pm.";
    expect(hasCommissiveForce(t, t.indexOf("tomorrow"))).toBe(false);
  });

  it("does not leak a commitment from a DIFFERENT sentence", () => {
    const t = "I'll handle the deploy. Your meeting is tomorrow.";
    expect(hasCommissiveForce(t, t.indexOf("tomorrow"))).toBe(false);
  });

  it("recognises let me / remind you / I will", () => {
    expect(hasCommissiveForce("let me check at 5pm", 13)).toBe(true);
    expect(hasCommissiveForce("I will follow up in 2 days", 18)).toBe(true);
  });
});

describe("extractFollowupPromises — commissive gate (English kinds)", () => {
  it("DROPS a descriptive English time phrase (no self-commitment)", () => {
    expect(kinds("Your meeting is tomorrow at 3pm.")).toEqual([]);
    expect(kinds("The report is due in 2 days.")).toEqual([]);
  });

  it("opt-in: WITHOUT requireCommissive the pure parser still emits (contract preserved)", () => {
    // The production hook sets requireCommissive; the bare parser path is unchanged.
    expect(kindsUngated("Your meeting is tomorrow at 3pm.").length).toBeGreaterThan(0);
  });

  it("KEEPS a genuine self-followup", () => {
    expect(kinds("I'll remind you tomorrow morning.")).toContain("tomorrow-slot");
    expect(kinds("Let me check back in 30 minutes.")).toContain("relative-minutes");
    expect(kinds("In 30 minutes I'll ping you.")).toContain("relative-minutes");
  });

  it("Korean kinds are ALSO gated on commissive force (할게/드릴게/하겠습니다 …) — a bare mention no longer sneaks past", () => {
    // The KO commitment '확인할게' governs the sentence → kept.
    expect(kinds("내일 아침에 확인할게").length).toBeGreaterThan(0);
    // A bare descriptive mention with no promise verb → dropped, same as the EN case.
    expect(kinds("내일 회의가 있어")).toEqual([]);
  });

  it("opt-in: WITHOUT requireCommissive a Korean descriptive mention still emits (contract preserved)", () => {
    expect(kindsUngated("내일 회의가 있어").length).toBeGreaterThan(0);
  });

  it("DROPS a bare Korean time mention with no commitment — the false-followup-root sim case", () => {
    // "7시에..." alone (no 할게/드릴게/하겠습니다) must NOT auto-create a followup.
    expect(kinds("7시에 회의가 있습니다.")).toEqual([]);
  });

  it("KEEPS the identical time phrase when a commitment verb governs the sentence", () => {
    expect(kinds("7시에 알려줄게요.")).toContain("korean-today-at");
    expect(kinds("7시에 확인해서 알려드릴게요.")).toContain("korean-today-at");
  });
});

describe("hasKoreanCommissiveForce", () => {
  it("true for 할게/드릴게/하겠습니다 conjugations governing the sentence", () => {
    expect(hasKoreanCommissiveForce("7시에 알려줄게요.", 0)).toBe(true);
    expect(hasKoreanCommissiveForce("확인해 드릴게요.", 0)).toBe(true);
    expect(hasKoreanCommissiveForce("다음달 5일에 다시 연락드리겠습니다.", 0)).toBe(true);
    expect(hasKoreanCommissiveForce("기억해둘게요!", 0)).toBe(true);
  });

  it("false for a bare descriptive/assertive Korean sentence (no commitment)", () => {
    expect(hasKoreanCommissiveForce("7시에 회의가 있습니다.", 0)).toBe(false);
    expect(hasKoreanCommissiveForce("금요일에 예약이 잡혀 있어요.", 0)).toBe(false);
  });

  it("does not leak a commitment from a DIFFERENT sentence", () => {
    const t = "확인할게요. 금요일에 회의가 있어요.";
    expect(hasKoreanCommissiveForce(t, t.indexOf("금요일"))).toBe(false);
  });
});
