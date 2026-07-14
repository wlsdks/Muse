import type { JsonObject } from "@muse/shared";
import { describe, expect, it } from "vitest";

import { createChatApprovalGate, formatApprovalNotice, type ChatPendingDraft } from "./chat-approval-gate.js";

function input(overrides: {
  readonly name: string;
  readonly risk: "read" | "write" | "execute";
  readonly args?: JsonObject;
  readonly userId?: string;
  readonly egressWarning?: string;
  readonly egressBlocked?: boolean;
}) {
  return {
    toolCall: { arguments: overrides.args ?? {}, id: "call-1", name: overrides.name },
    risk: overrides.risk,
    runId: "run-1",
    ...(overrides.userId ? { userId: overrides.userId } : {}),
    ...(overrides.egressWarning ? { egressWarning: overrides.egressWarning } : {}),
    ...(overrides.egressBlocked !== undefined ? { egressBlocked: overrides.egressBlocked } : {})
  };
}

describe("createChatApprovalGate", () => {
  it("allows a read tool and captures nothing", async () => {
    const sink: ChatPendingDraft[] = [];
    const gate = createChatApprovalGate(sink);
    const decision = await gate(input({ name: "muse.notes.search", risk: "read", args: { query: "x" } }));
    expect(decision.allowed).toBe(true);
    expect(sink).toHaveLength(0);
  });

  it("denies a write tool and captures its draft + args", async () => {
    const sink: ChatPendingDraft[] = [];
    const gate = createChatApprovalGate(sink);
    const args = { due: "2026-08-05", title: "Buy milk" };
    const decision = await gate(input({ name: "muse.tasks.add", risk: "write", args, userId: "u-9" }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('awaiting your approval for "muse.tasks.add" — due=2026-08-05, title=Buy milk');
    expect(sink).toEqual([
      { arguments: args, draft: "due=2026-08-05, title=Buy milk", risk: "write", tool: "muse.tasks.add", userId: "u-9" }
    ]);
  });

  it("denies an execute tool and captures it too", async () => {
    const sink: ChatPendingDraft[] = [];
    const gate = createChatApprovalGate(sink);
    const decision = await gate(input({ name: "muse.reminders.add", risk: "execute", args: { text: "call" } }));
    expect(decision.allowed).toBe(false);
    expect(sink).toHaveLength(1);
    expect(sink[0]).toMatchObject({ risk: "execute", tool: "muse.reminders.add" });
  });

  it("denies an egress-blocked call before the read fast-path", async () => {
    const sink: ChatPendingDraft[] = [];
    const gate = createChatApprovalGate(sink);
    const decision = await gate(input({ name: "muse.notes.search", risk: "read", egressBlocked: true, egressWarning: "planted url" }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("egress denied: planted url");
    expect(sink).toHaveLength(0);
  });
});

describe("formatApprovalNotice", () => {
  it("lists one line per captured draft", () => {
    const notice = formatApprovalNotice([
      { arguments: {}, draft: "title=Buy milk", risk: "write", tool: "muse.tasks.add" },
      { arguments: {}, draft: "", risk: "execute", tool: "muse.reminders.add" }
    ]);
    expect(notice).toBe(
      "\n\n🔒 These actions need your approval before I run them:\n- muse.tasks.add: title=Buy milk\n- muse.reminders.add"
    );
  });
});
