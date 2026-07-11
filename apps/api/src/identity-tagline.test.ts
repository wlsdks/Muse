import { MUSE_IDENTITY_CORE, SURFACE_ROLES } from "@muse/prompts";
import { describe, expect, it, vi } from "vitest";

import {
  applyTaglineModel,
  contentFreePool,
  gatherIdentityFacts,
  selectTagline,
  taglineIsGrounded,
  taglineIsWellFormed,
  taglinePersona,
  taglineTemplates
} from "./identity-tagline.js";

describe("taglinePersona — Phase 2+3 seam", () => {
  it("composes identity-core at position 0, then the lang persona, then the tagline role", () => {
    for (const lang of ["ko", "en"] as const) {
      const prompt = taglinePersona(lang);
      expect(prompt.startsWith(MUSE_IDENTITY_CORE)).toBe(true);
      expect(prompt).toContain(SURFACE_ROLES.tagline);
      expect(prompt.indexOf(SURFACE_ROLES.tagline)).toBeGreaterThan(prompt.indexOf(MUSE_IDENTITY_CORE));
    }
  });

  it("still carries the lang-specific voice flavor", () => {
    expect(taglinePersona("ko")).toContain("파랑새");
    expect(taglinePersona("en").toLowerCase()).toContain("bluebird");
  });
});

describe("gatherIdentityFacts — only short, user-facing values become atoms", () => {
  it("collects short fact/preference/topic values, dedups, skips long ones", () => {
    const atoms = gatherIdentityFacts({
      facts: { role: "개발자", bio: "저는 서울에 사는 백엔드 개발자이고 커피를 아주 좋아합니다" },
      preferences: { drink: "커피", dup: "커피" },
      recentTopics: ["Rust", ""]
    });
    expect(atoms).toContain("개발자");
    expect(atoms).toContain("커피");
    expect(atoms).toContain("Rust");
    // the long bio sentence is skipped (over the atom length cap)
    expect(atoms.some((a) => a.includes("백엔드 개발자이고"))).toBe(false);
    // "커피" is deduped despite appearing twice
    expect(atoms.filter((a) => a === "커피")).toHaveLength(1);
  });

  it("returns nothing for an empty / undefined profile", () => {
    expect(gatherIdentityFacts(undefined)).toEqual([]);
    expect(gatherIdentityFacts({})).toEqual([]);
    expect(gatherIdentityFacts({ facts: { x: "   " } })).toEqual([]);
  });
});

describe("selectTagline — grounded by construction, content-free when empty", () => {
  it("builds a grounded line that echoes a real atom", () => {
    const r = selectTagline({ atoms: ["커피"], lang: "ko", recent: [], rotation: 0 });
    expect(r.grounded).toBe(true);
    expect(r.tagline).toContain("커피");
  });

  it("FABRICATION FLOOR: an empty profile yields ONLY a content-free pool line, never an invented trait", () => {
    const pool = new Set(contentFreePool("ko"));
    const poolEn = new Set(contentFreePool("en"));
    for (let rotation = 0; rotation < 20; rotation += 1) {
      const ko = selectTagline({ atoms: [], lang: "ko", recent: [], rotation });
      const en = selectTagline({ atoms: [], lang: "en", recent: [], rotation });
      expect(ko.grounded).toBe(false);
      expect(en.grounded).toBe(false);
      // The ONLY lines producible with zero facts are the content-free pool.
      expect(pool.has(ko.tagline)).toBe(true);
      expect(poolEn.has(en.tagline)).toBe(true);
    }
  });

  it("varies across opens — no immediate repeat when a line is in the recent window", () => {
    const first = selectTagline({ atoms: [], lang: "ko", recent: [], rotation: 0 });
    const second = selectTagline({ atoms: [], lang: "ko", recent: [first.tagline], rotation: 0 });
    expect(second.tagline).not.toBe(first.tagline);
  });

  it("templates never exceed the subtitle length cap", () => {
    for (const line of taglineTemplates(["커피", "개발자"], "ko")) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
  });
});

describe("taglineIsGrounded — the hard fabrication gate on model output", () => {
  it("accepts a faithful re-phrase that echoes a real atom", () => {
    expect(taglineIsGrounded("커피 담당", ["커피"])).toBe(true);
    expect(taglineIsGrounded("On coffee duty", ["coffee"])).toBe(true);
  });

  it("REJECTS an invented trait absent from the atoms (mutation-sensitive)", () => {
    // "고양이" (cat) was never in the store — this must be rejected.
    expect(taglineIsGrounded("고양이 담당", ["커피"])).toBe(false);
    expect(taglineIsGrounded("On cat duty", ["coffee"])).toBe(false);
  });

  it("rejects a NEW number not present in the atoms", () => {
    expect(taglineIsGrounded("커피 3잔 담당", ["커피"])).toBe(false);
  });

  it("rejects over-length and refusal leakage", () => {
    expect(taglineIsGrounded("커피 " + "담당".repeat(30), ["커피"])).toBe(false);
    expect(taglineIsGrounded("I'm not sure", ["coffee"])).toBe(false);
  });
});

describe("taglineIsWellFormed — the SHAPE gate stacked on top of grounding", () => {
  it("REJECTS a bare-atom echo (grounded but no framing) — the reported 'Dr. Kim' bug", () => {
    // Grounded (every token is from the atom) yet a useless subtitle: it just
    // echoes a stored name and frames nothing.
    expect(taglineIsGrounded("Dr. Kim", ["Dr. Kim"])).toBe(true);
    expect(taglineIsWellFormed("Dr. Kim", ["Dr. Kim"])).toBe(false);
  });

  it("REJECTS a lowercase / spacing variant of the same bare echo", () => {
    expect(taglineIsWellFormed("dr kim", ["Dr. Kim"])).toBe(false);
    expect(taglineIsWellFormed("  DR.   KIM  ", ["Dr. Kim"])).toBe(false);
    expect(taglineIsWellFormed("커피", ["커피"])).toBe(false);
  });

  it("ACCEPTS a legitimately framed model line", () => {
    expect(taglineIsWellFormed("Dr. Kim 담당", ["Dr. Kim"])).toBe(true);
    expect(taglineIsWellFormed("커피 담당", ["커피"])).toBe(true);
    expect(taglineIsWellFormed("On coffee duty", ["coffee"])).toBe(true);
  });

  it("REGRESSION GUARD: every taglineTemplates line passes its own shape gate", () => {
    for (const atoms of [["커피", "개발자"], ["coffee", "dev"], ["Dr. Kim"], ["running"]]) {
      for (const lang of ["ko", "en"] as const) {
        for (const line of taglineTemplates(atoms, lang)) {
          expect(taglineIsWellFormed(line, atoms)).toBe(true);
        }
      }
    }
  });

  it("still rejects anything the grounding gate rejects (composes, never weakens it)", () => {
    expect(taglineIsWellFormed("고양이 담당", ["커피"])).toBe(false);
    expect(taglineIsWellFormed("커피 3잔 담당", ["커피"])).toBe(false);
  });
});

describe("gatherIdentityFacts — a clear person name never becomes a subtitle atom", () => {
  it("drops an honorific-prefixed name but keeps ordinary atoms", () => {
    const atoms = gatherIdentityFacts({
      facts: { dentist: "Dr. Kim", role: "개발자" },
      preferences: { drink: "커피", tutor: "김 선생님" },
      recentTopics: ["running", "Mr Lee", "날씨"]
    });
    expect(atoms).toContain("개발자");
    expect(atoms).toContain("커피");
    expect(atoms).toContain("running");
    // "날씨" (weather) is an ordinary topic — the ~씨 suffix is deliberately NOT filtered.
    expect(atoms).toContain("날씨");
    // Clear person names are dropped.
    expect(atoms).not.toContain("Dr. Kim");
    expect(atoms).not.toContain("김 선생님");
    expect(atoms).not.toContain("Mr Lee");
  });
});

describe("applyTaglineModel — swap ONLY a grounded re-phrase, never touch content-free", () => {
  it("BUG REGRESSION: a model that returns a bare 'Dr. Kim' ships a FRAMED template line, not the echo", async () => {
    const atoms = ["Dr. Kim"];
    const plan = selectTagline({ atoms, lang: "ko", recent: [], rotation: 0 });
    const out = await applyTaglineModel(plan, atoms, "ko", async () => "Dr. Kim");
    expect(out.tagline).not.toBe("Dr. Kim");
    expect(out.tagline).toBe(plan.tagline);
    // The shipped line frames the atom (adds 담당/파트너/곁 …), it isn't a bare name.
    expect(taglineIsWellFormed(out.tagline, atoms)).toBe(true);
  });

  it("swaps to the model line when it stays grounded", async () => {
    const plan = { grounded: true, tagline: "커피 담당" } as const;
    const out = await applyTaglineModel(plan, ["커피"], "ko", async () => "커피와 함께");
    expect(out.tagline).toBe("커피와 함께");
    expect(out.grounded).toBe(true);
  });

  it("keeps the deterministic line when the model invents a trait", async () => {
    const plan = { grounded: true, tagline: "커피 담당" } as const;
    const out = await applyTaglineModel(plan, ["커피"], "ko", async () => "고양이 담당");
    expect(out.tagline).toBe("커피 담당");
  });

  it("never calls the model for a content-free (no-atom) plan", async () => {
    const model = vi.fn(async () => "anything");
    const plan = { grounded: false, tagline: "당신만의 파랑새" } as const;
    const out = await applyTaglineModel(plan, [], "ko", model);
    expect(model).not.toHaveBeenCalled();
    expect(out.tagline).toBe("당신만의 파랑새");
  });

  it("keeps the deterministic line when the model throws", async () => {
    const plan = { grounded: true, tagline: "커피 담당" } as const;
    const out = await applyTaglineModel(plan, ["커피"], "ko", async () => {
      throw new Error("model down");
    });
    expect(out.tagline).toBe("커피 담당");
  });
});
