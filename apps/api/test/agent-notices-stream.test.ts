import type { AgentInitiatedNotice, AgentInitiatedNoticeBroker } from "@muse/agent-core";
import { describe, expect, it, vi } from "vitest";

import { streamNoticesFor } from "../src/agent-notices-routes.js";

function fakeBroker() {
  let cb: ((n: AgentInitiatedNotice) => void) | undefined;
  const unsubscribe = vi.fn(() => { cb = undefined; });
  const broker: AgentInitiatedNoticeBroker = {
    publish: (_userId, n) => cb?.(n),
    subscribe: (_userId, fn) => { cb = fn; return unsubscribe; }
  };
  return { broker, push: (n: AgentInitiatedNotice) => cb?.(n), unsubscribe };
}

const noSocket = { once: (_e: "close", _l: () => void): void => undefined };
const note: AgentInitiatedNotice = {
  generatedAt: "2026-05-17T00:00:00Z",
  kind: "task_due_soon",
  text: "x"
};

describe("streamNoticesFor unsubscribe lifecycle", () => {
  it("unsubscribes when the consumer disconnects at the open frame (no broker leak)", async () => {
    const { broker, unsubscribe } = fakeBroker();
    const gen = streamNoticesFor(broker, "u1", noSocket) as AsyncGenerator<string, void, unknown>;
    const first = await gen.next();
    expect(String(first.value)).toContain("event: open");
    // SSE consumer / Readable destroyed while suspended at the open
    // frame — pre-fix the open yield was outside the try so finally
    // never ran and the broker subscription leaked.
    await gen.return(undefined);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes when the consumer disconnects mid-stream (no regression)", async () => {
    const { broker, push, unsubscribe } = fakeBroker();
    const gen = streamNoticesFor(broker, "u1", noSocket) as AsyncGenerator<string, void, unknown>;
    await gen.next(); // open frame
    push(note);
    const second = await gen.next();
    expect(String(second.value)).toContain("event: notice");
    await gen.return(undefined);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
