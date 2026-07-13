import { describe, expect, it } from "vitest";

import { groundToolArguments } from "../src/tool-argument-grounding.js";

describe("groundToolArguments — drop a fabricated free-text arg the utterance doesn't support", () => {
  it("drops a location the user never mentioned", () => {
    const out = groundToolArguments({ location: "강남역", title: "회의" }, ["location", "notes"], "회의 잡아줘");
    expect(out.args).toEqual({ title: "회의" });
    expect(out.dropped).toEqual(["location"]);
  });

  it("keeps a location grounded across Korean particle attachment (강남역 ⊂ 강남역에서)", () => {
    const out = groundToolArguments({ location: "강남역", title: "회의" }, ["location"], "강남역에서 회의 잡아줘");
    expect(out.args).toEqual({ location: "강남역", title: "회의" });
    expect(out.dropped).toEqual([]);
  });

  it("keeps an English location the user stated", () => {
    const out = groundToolArguments({ location: "Room 4" }, ["location"], "book a meeting in Room 4");
    expect(out.dropped).toEqual([]);
  });

  it("does NOT ground a value token that is only a MID-word substring of an unrelated word", () => {
    // The old raw-substring matcher let a fabricated "art" survive on "start" (and "cat" on "catch").
    const out = groundToolArguments({ location: "art studio" }, ["location"], "let's start the meeting");
    expect(out.args).toEqual({});
    expect(out.dropped).toEqual(["location"]);
  });

  it("still grounds across morphology — a token that PREFIXES a longer utterance word (meeting → meetings)", () => {
    const out = groundToolArguments({ notes: "meeting agenda" }, ["notes"], "set up the meetings tomorrow");
    expect(out.dropped).toEqual([]); // "meeting" begins the word "meetings" — a word-start match, kept
  });

  it("drops fabricated notes but keeps grounded ones", () => {
    const out = groundToolArguments(
      { notes: "bring your passport", location: "공항" },
      ["location", "notes"],
      "공항 가는 일정 추가해줘"
    );
    expect(out.args).toEqual({ location: "공항" });
    expect(out.dropped).toEqual(["notes"]);
  });

  it("never touches a required/non-listed arg or a non-string value", () => {
    const out = groundToolArguments({ title: "fabricated title", count: 3 }, ["location"], "anything");
    expect(out.args).toEqual({ title: "fabricated title", count: 3 });
    expect(out.dropped).toEqual([]);
  });

  it("fail-open on an empty utterance — never drop when grounding can't be assessed", () => {
    const out = groundToolArguments({ location: "강남역" }, ["location"], "   ");
    expect(out.args).toEqual({ location: "강남역" });
    expect(out.dropped).toEqual([]);
  });

  it("drops fabricated tag elements but keeps grounded ones — partial array NOT reported as dropped", () => {
    const out = groundToolArguments(
      { tags: ["운동", "회의", "강남"], title: "운동" },
      ["tags"],
      "운동 일정 추가해줘"
    );
    expect(out.args).toEqual({ tags: ["운동"], title: "운동" });
    // partial clean: the arg survives with the grounded element, so it is NOT in dropped
    expect(out.dropped).toEqual([]);
  });

  it("removes the tags arg entirely when every element is fabricated", () => {
    const out = groundToolArguments({ tags: ["회의", "강남"] }, ["tags"], "운동 추가");
    expect(out.args).toEqual({});
    expect(out.dropped).toEqual(["tags"]);
  });

  it("keeps a fully-grounded tag array untouched (not reported as dropped)", () => {
    const out = groundToolArguments({ tags: ["운동"] }, ["tags"], "운동 일정");
    expect(out.args).toEqual({ tags: ["운동"] });
    expect(out.dropped).toEqual([]);
  });

  it("partial array: cleaned survivors kept, name absent from dropped", () => {
    const out = groundToolArguments(
      { tags: ["work", "fabricated"] },
      ["tags"],
      "tag it work and urgent"
    );
    expect(out.args).toEqual({ tags: ["work"] });
    expect(out.dropped).not.toContain("tags");
  });

  it("all-fabricated array: arg removed AND reported in dropped", () => {
    const out = groundToolArguments(
      { tags: ["xyz", "qwe"] },
      ["tags"],
      "add a task for today"
    );
    expect(Object.prototype.hasOwnProperty.call(out.args, "tags")).toBe(false);
    expect(out.dropped).toContain("tags");
  });

  it("all-grounded array: unchanged and not in dropped", () => {
    const out = groundToolArguments(
      { tags: ["work", "urgent"] },
      ["tags"],
      "tag it work and urgent"
    );
    expect(out.args).toEqual({ tags: ["work", "urgent"] });
    expect(out.dropped).toEqual([]);
  });

  it("string full drop still reported in dropped (regression)", () => {
    const out = groundToolArguments(
      { notes: "completely fabricated content" },
      ["notes"],
      "add a task"
    );
    expect(Object.prototype.hasOwnProperty.call(out.args, "notes")).toBe(false);
    expect(out.dropped).toContain("notes");
  });

  it("string grounded kept and not in dropped (regression)", () => {
    const out = groundToolArguments(
      { notes: "urgent task" },
      ["notes"],
      "add an urgent task"
    );
    expect(out.args).toEqual({ notes: "urgent task" });
    expect(out.dropped).toEqual([]);
  });

  it("does not mutate the input object", () => {
    const input = { location: "강남역", title: "회의" };
    groundToolArguments(input, ["location"], "회의");
    expect(input).toEqual({ location: "강남역", title: "회의" });
  });

  it("drops a fabricated followup-cancel reason the user never stated", () => {
    // The 8B fabricates a reason like "user changed plans" when the user
    // merely said "cancel that followup". The reason must be dropped.
    const out = groundToolArguments(
      { id: "fu_123", reason: "user changed plans" },
      ["reason"],
      "cancel that followup"
    );
    expect(out.args).toEqual({ id: "fu_123" });
    expect(out.dropped).toEqual(["reason"]);
  });

  it("keeps a followup-cancel reason the user explicitly stated", () => {
    const out = groundToolArguments(
      { id: "fu_123", reason: "rescheduled" },
      ["reason"],
      "cancel the followup — rescheduled"
    );
    expect(out.args).toEqual({ id: "fu_123", reason: "rescheduled" });
    expect(out.dropped).toEqual([]);
  });
});

describe("groundToolArguments — nested OBJECT value: clean fabricated string leaves (total over value shapes, not string-only)", () => {
  it("drops a fabricated string leaf inside a nested object, keeps the grounded one — arg SURVIVES (partial, not reported dropped)", () => {
    const out = groundToolArguments(
      { meta: { place: "강남역", note: "지어낸내용" }, title: "회의" },
      ["meta"],
      "강남역에서 회의 잡아줘"
    );
    expect(out.args).toEqual({ meta: { place: "강남역" }, title: "회의" });
    expect(out.dropped).toEqual([]);
  });

  it("removes the object arg entirely when EVERY string leaf is fabricated", () => {
    const out = groundToolArguments(
      { meta: { place: "부산", note: "지어낸내용" } },
      ["meta"],
      "강남역에서 회의 잡아줘"
    );
    expect(out.args).toEqual({});
    expect(out.dropped).toEqual(["meta"]);
  });

  it("keeps a fully-grounded nested object untouched (not reported as dropped)", () => {
    const out = groundToolArguments({ meta: { place: "강남역" } }, ["meta"], "강남역 회의");
    expect(out.args).toEqual({ meta: { place: "강남역" } });
    expect(out.dropped).toEqual([]);
  });

  it("preserves NON-string leaves (numbers/booleans) — grounding only assesses free-text", () => {
    const out = groundToolArguments(
      { meta: { count: 5, allDay: true, place: "강남역" } },
      ["meta"],
      "강남역 회의"
    );
    expect(out.args).toEqual({ meta: { count: 5, allDay: true, place: "강남역" } });
    expect(out.dropped).toEqual([]);
  });

  it("does NOT corrupt a MIXED array (non-string elements) into an index-keyed object — leaves it untouched", () => {
    // sibling-audit: arrays are typeof "object"; the object branch must exclude them
    // so a mixed array isn't rewritten to {0:…,1:…}. A pure string[] is the array
    // branch's job; anything else is left as-is rather than mangled.
    const mixed = ["강남역", { note: "지어낸내용" }];
    const out = groundToolArguments({ items: mixed }, ["items"], "회의");
    expect(out.args).toEqual({ items: ["강남역", { note: "지어낸내용" }] });
    expect(Array.isArray((out.args as { items: unknown }).items)).toBe(true);
    expect(out.dropped).toEqual([]);
  });
});

describe("groundToolArguments — KO normalization (a real arg must not false-drop on NFD/NFC/full-width)", () => {
  it("a KO location the model fills NFC grounds against an NFD utterance (not dropped as fabricated)", () => {
    const r = groundToolArguments({ location: "회의실".normalize("NFC"), title: "미팅" }, ["location"], "회의실에서 만나자".normalize("NFD"));
    expect(r.dropped).not.toContain("location");
    expect(r.args.location).toBe("회의실".normalize("NFC"));
  });
  it("a full-width-digit arg grounds against the ASCII utterance form", () => {
    const r = groundToolArguments({ room: "１２３호" }, ["room"], "123호에서 보자");
    expect(r.dropped).not.toContain("room");
  });
  it("STILL drops a genuinely fabricated arg — the anti-fabrication guard is not weakened", () => {
    const r = groundToolArguments({ location: "강남역" }, ["location"], "회의 잡아줘");
    expect(r.dropped).toContain("location");
    expect(r.args.location).toBeUndefined();
  });
});

describe("groundToolArguments — per-field modes (name:mode entries)", () => {
  describe("email mode — the DOMAIN must vouch, the name-echoing local part cannot", () => {
    it("drops a fabricated domain even though the local part echoes the contact name", () => {
      const r = groundToolArguments(
        { email: "bob@gmail.com", name: "Bob" },
        ["email:email"],
        "밥(Bob) 연락처 저장해줘, 전화는 010-1234-5678"
      );
      expect(r.dropped).toContain("email");
      expect(r.args.email).toBeUndefined();
    });
    it("keeps an email whose domain the user actually stated", () => {
      const r = groundToolArguments(
        { email: "bob@acme.com" },
        ["email:email"],
        "save Bob, his email is bob@acme.com"
      );
      expect(r.dropped).toEqual([]);
      expect(r.args.email).toBe("bob@acme.com");
    });
    it("keeps a multi-label domain when its registrable labels are all stated", () => {
      const r = groundToolArguments(
        { email: "kim@mail.snu.ac.kr" },
        ["email:email"],
        "김교수님 메일 kim@mail.snu.ac.kr 저장"
      );
      expect(r.dropped).toEqual([]);
    });
    it("a non-email-shaped value falls back to the default any-token rule", () => {
      const r = groundToolArguments({ email: "acme sales desk" }, ["email:email"], "acme 영업팀 메일 저장해줘");
      expect(r.dropped).toEqual([]);
    });
  });

  describe("handle mode — only a literal @body in the utterance vouches", () => {
    it("drops a handle invented from the bare contact name", () => {
      const r = groundToolArguments({ handle: "@bob" }, ["handle:handle"], "Bob 저장해줘, 전화 010-1234-5678");
      expect(r.dropped).toContain("handle");
    });
    it("keeps a handle the user literally typed", () => {
      const r = groundToolArguments({ handle: "@bob" }, ["handle:handle"], "add Bob, telegram @bob");
      expect(r.dropped).toEqual([]);
      expect(r.args.handle).toBe("@bob");
    });
  });

  describe("date mode — numeric components must each appear (reformat-tolerant)", () => {
    it("keeps a zero-padded MM-DD reformatted from a KO date", () => {
      const r = groundToolArguments({ birthday: "05-15" }, ["birthday:date"], "엄마 생일은 5월 15일이야");
      expect(r.dropped).toEqual([]);
      expect(r.args.birthday).toBe("05-15");
    });
    it("keeps MM-DD stated with an English month name", () => {
      const r = groundToolArguments({ birthday: "12-25" }, ["birthday:date"], "her birthday is December 25");
      expect(r.dropped).toEqual([]);
    });
    it("drops a birthday whose components the user never stated", () => {
      const r = groundToolArguments({ birthday: "12-25" }, ["birthday:date"], "밥 연락처 저장, 전화 010-1234-5678");
      expect(r.dropped).toContain("birthday");
    });
    it("drops a YYYY-MM-DD whose year was never stated (partial vouching is not vouching)", () => {
      const r = groundToolArguments({ birthday: "1990-05-15" }, ["birthday:date"], "생일 5월 15일로 저장");
      expect(r.dropped).toContain("birthday");
    });
    it("keeps a full date when every component was stated", () => {
      const r = groundToolArguments({ birthday: "1990-05-15" }, ["birthday:date"], "1990년 5월 15일생이야");
      expect(r.dropped).toEqual([]);
    });
  });

  it("an unknown mode suffix falls back to the default rule instead of throwing", () => {
    const r = groundToolArguments({ note: "강남역" }, ["note:mystery"], "강남역에서 만나기로 함");
    expect(r.dropped).toEqual([]);
  });
});

describe("groundToolArguments — phone mode (the identifier hole the ANY-token rule left open)", () => {
  it("drops a fabricated number that only 'grounds' via an unrelated digit run in the utterance", () => {
    const r = groundToolArguments(
      { name: "Bob", phone: "010-1234-5678" },
      ["phone:phone"],
      "밥 저장해줘, 1234번 회의실에서 만났어"
    );
    expect(r.dropped).toContain("phone");
    expect(r.args.phone).toBeUndefined();
  });

  it("keeps a number the user actually stated, in any separator format", () => {
    const spaced = groundToolArguments({ phone: "010-1234-5678" }, ["phone:phone"], "밥 번호는 010 1234 5678 이야");
    expect(spaced.dropped).toEqual([]);
    const dashed = groundToolArguments({ phone: "+1 415 555 0101" }, ["phone:phone"], "her number is +1-415-555-0101");
    expect(dashed.dropped).toEqual([]);
  });

  it("drops a number whose digits are only PARTIALLY present (a half-invented number)", () => {
    const r = groundToolArguments({ phone: "010-1234-9999" }, ["phone:phone"], "번호는 010-1234-5678 이야");
    expect(r.dropped).toContain("phone");
  });

  it("a digitless value falls back to the default rule (no false drop)", () => {
    const r = groundToolArguments({ phone: "회사 대표번호" }, ["phone:phone"], "회사 대표번호로 저장해줘");
    expect(r.dropped).toEqual([]);
  });
});
