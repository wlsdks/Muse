import { describe, expect, it } from "vitest";

import { answerPromisesAction, classifyActionRequest, classifyCasualPrompt, classifyCorpusOverview, classifyMetaPrompt } from "../src/index.js";

describe("classifyCasualPrompt — pure social prompts only (precision-first)", () => {
  it("classifies greetings (EN + KO), tolerating trailing punctuation and repeats", () => {
    for (const q of ["hi", "Hi!", "hello", "hey there", "HELLO", "hiii", "안녕", "안녕하세요", "good morning", "hey muse"]) {
      expect(classifyCasualPrompt(q)).toBe("greeting");
    }
  });

  it("classifies KO time-of-day greetings incl. the copula suffix (so they take the fast path, not the 7s grounded path)", () => {
    for (const q of ["좋은 아침", "좋은 아침이야", "좋은 아침이에요", "좋은 저녁이에요", "좋은 밤", "좋은 오후예요", "굿모닝"]) {
      expect(classifyCasualPrompt(q)).toBe("greeting");
    }
  });

  it("does NOT mistake a real question that merely STARTS with a time-of-day phrase for a greeting", () => {
    for (const q of ["좋은 하루 보내는 방법 알려줘", "내 아침 일정 뭐야", "좋은 아침 뭐 먹을까"]) {
      expect(classifyCasualPrompt(q)).toBeNull();
    }
  });

  it("classifies thanks (EN + KO), incl. KO 수고 variants", () => {
    for (const q of ["thanks", "Thank you", "thx", "ty", "고마워", "감사합니다", "appreciate it", "수고했어", "수고하셨어요", "수고"]) {
      expect(classifyCasualPrompt(q)).toBe("thanks");
    }
  });

  it("classifies farewells (EN + KO), incl. KO good-night 잘 자 / 굿나잇", () => {
    for (const q of ["bye", "goodbye", "see you", "take care", "잘가", "안녕히 계세요", "잘 자", "잘자요", "굿나잇", "푹 자요"]) {
      expect(classifyCasualPrompt(q)).toBe("farewell");
    }
  });

  it("does NOT mistake a real request that merely STARTS with a farewell/thanks word", () => {
    for (const q of ["잘 자는 방법 알려줘", "수고했어 오늘 일정 정리해줘", "잘 자라고 알람 맞춰줘"]) {
      expect(classifyCasualPrompt(q)).toBeNull();
    }
  });

  it("returns null for a real question — even when it OPENS with a social word", () => {
    for (const q of [
      "what is my monthly rent?",
      "hi, what's my MTU?",
      "thanks — when is the dentist cleaning?",
      "hello world program in rust",
      "who is my landlord",
      "bye-bye script: what does it do?",
      "thank you note template for the wedding"
    ]) {
      expect(classifyCasualPrompt(q)).toBeNull();
    }
  });

  it("returns null for empty / whitespace input", () => {
    expect(classifyCasualPrompt("")).toBeNull();
    expect(classifyCasualPrompt("   ")).toBeNull();
  });

  it("never misclassifies a long prompt as casual (the 30-char content guard)", () => {
    expect(classifyCasualPrompt("hello, could you summarise my meeting notes from yesterday")).toBeNull();
  });
});

describe("classifyMetaPrompt — questions ABOUT Muse itself (precision-first)", () => {
  it("matches self-referential capability / identity / usage questions (EN + KO)", () => {
    for (const q of [
      "what can you do?", "what can you do", "what do you do", "what are you",
      "who are you?", "what is muse", "how do you work?", "how does this work",
      "what can I ask", "help", "넌 뭐야?", "뭐 할 수 있어", "어떻게 작동해", "사용법",
      "넌 뭐 할 수 있어?", "너 뭐 할 수 있어", "뭐 할 줄 알아?", "누구야"
    ]) {
      expect(classifyMetaPrompt(q)).toBe(true);
    }
  });

  it("NFD Korean misses the classifier (the macOS/Swift desktop bug) — NFC normalization recovers it", () => {
    // macOS/Swift passes CLI args in NFD (Hangul decomposed into jamo), so the
    // desktop companion's Korean turns missed every NFC classifier. runLocalChat
    // now NFC-normalizes the message; this documents why.
    const nfd = "뭐 할 수 있어?".normalize("NFD");
    expect(nfd).not.toBe("뭐 할 수 있어?");
    expect(classifyMetaPrompt(nfd)).toBe(false);
    expect(classifyMetaPrompt(nfd.normalize("NFC"))).toBe(true);
  });

  it("does NOT match a question about the user's notes that merely contains a meta word", () => {
    for (const q of [
      "what can you do about my taxes?",
      "how do you make sourdough",
      "what are you working on in the migration plan",
      "who are the attendees in the Q3 meeting",
      "what is my rent",
      "파이썬으로 뭐 할 수 있어?",
      "오늘 뭐 할 수 있는 시간 있어?"
    ]) {
      expect(classifyMetaPrompt(q)).toBe(false);
    }
  });
});

describe("classifyActionRequest — imperative DO-something requests (needs tools), not questions", () => {
  it("matches imperative action requests, with or without a polite lead", () => {
    for (const q of [
      "remind me to call the dentist tomorrow",
      "set a reminder for the 9am standup",
      "add a task to review the deck",
      "create an event for Friday",
      "email Sarah the notes",
      "can you remind me to water the plants",
      "please add a reminder to renew the passport",
      "I'd like you to schedule a call with Mina"
    ]) {
      expect(classifyActionRequest(q)).toBe(true);
    }
  });

  it("does NOT match a QUESTION about actions/reminders (only imperatives)", () => {
    for (const q of [
      "what reminders do I have?",
      "when is my dentist reminder?",
      "did you email Sarah?",
      "what should I remind myself about",
      "how do I set a reminder",
      "what is my rent"
    ]) {
      expect(classifyActionRequest(q)).toBe(false);
    }
  });
});

describe("answerPromisesAction — catches a false 'I'll remind you' in the ANSWER (incl. mixed requests)", () => {
  it("matches an answer that claims it set/will set a tool action", () => {
    for (const a of [
      "Your rent is 1,250,000 KRW. I will remind you to pay it tomorrow.",
      "I'll set a reminder for the standup.",
      "I've set a reminder to renew the passport.",
      "Sure — I'll add a task to review the deck.",
      "I have scheduled the lunch.",
      "I'm going to email Sarah the notes."
    ]) {
      expect(answerPromisesAction(a)).toBe(true);
    }
  });

  it("does NOT match a plain cited answer or a conversational 'I'll explain'", () => {
    for (const a of [
      "Your rent is 1,250,000 KRW [from lease.md].",
      "I'll explain how WireGuard MTU works.",
      "I'm not sure — that isn't in your notes.",
      "You have a reminder to pay rent tomorrow."
    ]) {
      expect(answerPromisesAction(a)).toBe(false);
    }
  });
});

describe("classifyCorpusOverview — whole-corpus overview, not a specific recall", () => {
  it("matches an overview/listing request about the whole note corpus (EN + KO)", () => {
    for (const q of [
      "what's in my notes?",
      "summarize my notes",
      "list my notes",
      "give me a one-line summary of what's in my notes",
      "what do I have notes",
      "내 노트 요약",
      "노트 목록"
    ]) {
      expect(classifyCorpusOverview(q)).toBe(true);
    }
  });

  it("does NOT match a SPECIFIC question that ends in its own topic, not 'notes'", () => {
    for (const q of [
      "what's in my notes about the VPN?",
      "summarize my VPN notes",
      "what is my rent",
      "list the attendees of the Q3 meeting",
      "what did I write about the migration plan"
    ]) {
      expect(classifyCorpusOverview(q)).toBe(false);
    }
  });
});
