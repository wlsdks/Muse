import type { ModelResponse } from "@muse/model";
import { describe, expect, it } from "vitest";

import {
  createEnglishGreetingStripResponseFilter,
  createGreetingStripResponseFilter
} from "../src/response-filters-greeting-strip.js";

function res(output: string): ModelResponse {
  return { id: "r", model: "m", output, raw: {} } satisfies ModelResponse;
}

describe("createEnglishGreetingStripResponseFilter", () => {
  const filter = createEnglishGreetingStripResponseFilter();

  it("strips the standalone compliance filler that undercuts the JARVIS persona", () => {
    expect(filter.apply(res("Sure! The deploy went green.")).output).toBe("The deploy went green.");
    expect(filter.apply(res("Of course! Here are your tasks.")).output).toBe("Here are your tasks.");
    expect(filter.apply(res("Got it! Now what?")).output).toBe("Now what?");
  });

  it("strips a leading 'Hi there!' / 'Good morning, sir!' greeting before the real reply", () => {
    expect(filter.apply(res("Hi there! Two open tasks today.")).output).toBe("Two open tasks today.");
    expect(filter.apply(res("Good morning, sir! Reminder fires at 3pm.")).output).toBe("Reminder fires at 3pm.");
  });

  it("strips STACKED preambles in a single pass (pass-bounded loop, no leftover lead-in)", () => {
    expect(filter.apply(res("Sure! Hi there! Got it! actual answer here")).output).toBe("actual answer here");
  });

  it("never strips a greeting-only reply down to silence — the inbound path treats empty as 'handled, send nothing'", () => {
    // Real content after the punctuation is the WHOLE strip contract:
    // a one-word reply ("Sure!") has no trailing content + whitespace,
    // so the filler regex declines to match.
    expect(filter.apply(res("Sure!")).output).toBe("Sure!");
    expect(filter.apply(res("Hi there!")).output).toBe("Hi there!");
  });

  it("does NOT strip 'Surely…' / 'Of course not.' / 'Absolutely fascinating' — those open real content, not preamble", () => {
    expect(filter.apply(res("Surely you can't be serious.")).output).toBe("Surely you can't be serious.");
    expect(filter.apply(res("Of course not. The migration is safe.")).output).toBe("Of course not. The migration is safe.");
    expect(filter.apply(res("Absolutely fascinating data this morning.")).output).toBe("Absolutely fascinating data this morning.");
  });

  it("is a no-op on an empty or already-clean reply (same response object semantics)", () => {
    expect(filter.apply(res("")).output).toBe("");
    expect(filter.apply(res("Two open tasks today.")).output).toBe("Two open tasks today.");
  });
});

describe("createGreetingStripResponseFilter (Korean)", () => {
  const filter = createGreetingStripResponseFilter();

  it("strips 안녕하세요 / 반갑습니다 / 좋은 아침이에요 lead-ins before the real reply", () => {
    expect(filter.apply(res("안녕하세요! 오늘 일정 3건입니다.")).output).toBe("오늘 일정 3건입니다.");
    expect(filter.apply(res("반갑습니다! 회의록 정리해 드릴게요.")).output).toBe("회의록 정리해 드릴게요.");
    expect(filter.apply(res("좋은 아침이에요! 어제 알림 2건이 있었습니다.")).output).toBe("어제 알림 2건이 있었습니다.");
  });

  it("strips the standalone Korean filler '물론입니다' / '알겠습니다' / '네' / '당연하죠' before the real reply", () => {
    expect(filter.apply(res("물론입니다! 다음 단계로 넘어가시죠.")).output).toBe("다음 단계로 넘어가시죠.");
    expect(filter.apply(res("알겠습니다! 마감 알림을 설정했습니다.")).output).toBe("마감 알림을 설정했습니다.");
  });

  it("never strips a one-word filler-only reply down to silence (네., 물론입니다.)", () => {
    expect(filter.apply(res("네.")).output).toBe("네.");
    expect(filter.apply(res("물론입니다.")).output).toBe("물론입니다.");
  });

  it("does NOT strip '물론 그것도 가능합니다' — '물론' opens real content, not preamble", () => {
    expect(filter.apply(res("물론 그것도 가능합니다.")).output).toBe("물론 그것도 가능합니다.");
  });
});
