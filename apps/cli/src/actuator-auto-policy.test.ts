/**
 * The auto-run classification and the gate branch that consumes it.
 *
 * `auto` is the only mode that can execute an actuator with no human in the
 * loop, so these assert the DENY side hardest: every third-party send, every
 * tool whose reversibility cannot be established, and every unknown tool must
 * still confirm.
 */

import { describe, expect, it, vi } from "vitest";

import { AUTO_RUNNABLE_ACTUATORS, isAutoRunnableActuator } from "./actuator-auto-policy.js";
import { chatToolApprovalGate } from "./chat-ink-core.js";

const OUTBOUND = ["email_send", "web_action", "home_action", "smart_home", "muse.messaging.send", "objective.act"];

type AskFn = (name: string, detail: string, kind: "outbound" | "tool") => Promise<boolean>;

function gate(mode: "off" | "ask" | "auto", ask: ReturnType<typeof vi.fn<AskFn>> = vi.fn<AskFn>(async () => true)) {
  return { ask, run: chatToolApprovalGate(OUTBOUND, ask, undefined, () => new Date(), mode) };
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { risk: "execute" as const, runId: "r1", toolCall: { arguments: args, id: "t1", name }, userId: "stark" };
}

describe("auto-run classification", () => {
  it("never includes a third-party send", () => {
    for (const send of ["email_send", "email_reply", "email_forward", "web_action", "mac_message_send", "muse.messaging.send", "objective.act"]) {
      expect(isAutoRunnableActuator(send), `${send} must not auto-run`).toBe(false);
    }
  });

  it("excludes mac_shortcut_run — its reversibility depends on contents Muse cannot inspect", () => {
    expect(isAutoRunnableActuator("mac_shortcut_run")).toBe(false);
  });

  it("excludes the irreversible-or-invisible local tools", () => {
    // mac_system_set can sleep the Mac (Muse cannot wake it to undo);
    // mac_clipboard_set silently destroys what the user was about to paste;
    // mac_contacts_write is invisible AND decides where a later send goes.
    for (const tool of ["mac_system_set", "mac_clipboard_set", "mac_contacts_write"]) {
      expect(isAutoRunnableActuator(tool), `${tool} must not auto-run`).toBe(false);
    }
  });

  it("is an ALLOWLIST — an unknown/new tool confirms by default", () => {
    expect(isAutoRunnableActuator("some_future_tool")).toBe(false);
    expect(isAutoRunnableActuator("")).toBe(false);
  });

  it("includes only visible, self-reversible, local-only actions", () => {
    expect([...AUTO_RUNNABLE_ACTUATORS].sort()).toEqual([
      "mac_app_open", "mac_app_read", "mac_media_control",
      "mac_say", "mac_screen_read", "mac_screenshot", "mac_spotlight_search"
    ]);
  });
});

describe("gate — auto runs the recoverable set without asking", () => {
  it("auto-runs an allowlisted actuator and never prompts", async () => {
    const { ask, run } = gate("auto");
    await expect(run(call("mac_say", { text: "hi" }))).resolves.toEqual({ allowed: true });
    expect(ask).not.toHaveBeenCalled();
  });

  it("ask mode still prompts for the SAME tool", async () => {
    const { ask, run } = gate("ask");
    await run(call("mac_say", { text: "hi" }));
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe("gate — auto never widens a third-party send", () => {
  it("still prompts for email_send in auto", async () => {
    const { ask, run } = gate("auto");
    await run(call("email_send", { to: "kim@example.com" }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]?.[2]).toBe("outbound");
  });

  it("a denied send in auto is refused, not executed", async () => {
    const ask = vi.fn<AskFn>(async () => false);
    const { run } = gate("auto", ask);
    await expect(run(call("email_send", { to: "kim@example.com" }))).resolves.toMatchObject({ allowed: false });
  });

  it("still prompts for mac_shortcut_run and mac_contacts_write in auto", async () => {
    for (const tool of ["mac_shortcut_run", "mac_contacts_write"]) {
      const { ask, run } = gate("auto");
      await run(call(tool));
      expect(ask, `${tool} must prompt`).toHaveBeenCalledTimes(1);
    }
  });
});

describe("gate — auto cannot override an egress denial", () => {
  it("an egress-blocked call is refused even for an auto-runnable tool", async () => {
    const { ask, run } = gate("auto");
    const decision = await run({ ...call("mac_app_open", { target: "https://x.test" }), egressBlocked: true, egressWarning: "URL was not observed" });
    expect(decision).toMatchObject({ allowed: false });
    expect(String((decision as { reason?: string }).reason)).toContain("egress denied");
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("gate — the mode defaults to ask", () => {
  it("a caller that passes no mode gets the confirming behaviour", async () => {
    const ask = vi.fn<AskFn>(async () => true);
    const run = chatToolApprovalGate(OUTBOUND, ask);
    await run(call("mac_say", { text: "hi" }));
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
