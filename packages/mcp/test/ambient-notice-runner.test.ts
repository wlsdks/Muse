import { describe, expect, it } from "vitest";

import {
  createAmbientNoticeRunner,
  type AmbientNoticeRule,
  type AmbientSignal,
  type ProactiveNoticeSink
} from "../src/index.js";

const standup: AmbientNoticeRule = {
  id: "standup",
  match: { window: "standup" },
  message: "Standup at 14:00 — open your notes.",
  title: "Standup"
};

function setup() {
  let current: AmbientSignal | undefined;
  const delivered: { text: string; title: string; kind: string }[] = [];
  const sink: ProactiveNoticeSink = { deliver: (notice) => { delivered.push(notice); } };
  const runner = createAmbientNoticeRunner({ rules: [standup], sink, source: { snapshot: () => current } });
  return { delivered, runner, set: (signal: AmbientSignal | undefined) => { current = signal; } };
}

describe("createAmbientNoticeRunner — edge-triggered continuous perception", () => {
  it("fires on the rising edge, stays quiet while the condition holds, re-arms after it clears", async () => {
    const { delivered, runner, set } = setup();

    set({ window: "Team Standup — 14:00" });
    expect((await runner.tick()).delivered).toBe(1); // rising edge → fire

    expect((await runner.tick()).delivered).toBe(0); // still matching → no re-fire

    set({ window: "Spotify" });
    expect((await runner.tick()).delivered).toBe(0); // cleared → no fire, re-arms

    set({ window: "Daily Standup" });
    expect((await runner.tick()).delivered).toBe(1); // matches again → fires again

    expect(delivered).toHaveLength(2);
    expect(delivered.every((notice) => notice.text.includes("Standup at 14:00"))).toBe(true);
  });

  it("fail-soft: a throwing source delivers nothing and re-arms cleanly", async () => {
    const delivered: unknown[] = [];
    const sink: ProactiveNoticeSink = { deliver: (notice) => { delivered.push(notice); } };
    const runner = createAmbientNoticeRunner({
      rules: [standup],
      sink,
      source: { snapshot: () => { throw new Error("cannot read active window"); } }
    });
    expect((await runner.tick()).delivered).toBe(0);
    expect(delivered).toHaveLength(0);
  });
});
