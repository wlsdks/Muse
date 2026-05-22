import { describe, expect, it } from "vitest";

import { GmailEmailProvider, summarizeInbox, unreadBriefingLine, type EmailSummary } from "./email-provider.js";

// Contract-faithful Gmail REST fake: routes messages.list vs
// messages.get/{id}, asserts the Bearer header, returns Gmail-shaped
// JSON. Never a fake registry.
function gmailFetch(opts: {
  ids?: string[];
  messages?: Record<string, { from: string; subject: string; date?: string; snippet: string; unread: boolean }>;
  listStatus?: number;
  authError?: number;
}): { fetchImpl: typeof globalThis.fetch; calls: string[]; sawBearer: boolean } {
  const calls: string[] = [];
  let sawBearer = false;
  const fetchImpl = (async (url: string | URL, init?: { headers?: Record<string, string> }) => {
    const u = String(url);
    calls.push(u);
    if ((init?.headers?.authorization ?? "").startsWith("Bearer ")) sawBearer = true;
    if (opts.authError) {
      return new Response("{}", { status: opts.authError });
    }
    if (u.includes("/messages?")) {
      if (opts.listStatus && opts.listStatus !== 200) return new Response("{}", { status: opts.listStatus });
      return new Response(JSON.stringify({ messages: (opts.ids ?? []).map((id) => ({ id })) }), { status: 200 });
    }
    const id = decodeURIComponent(u.split("/messages/")[1]?.split("?")[0] ?? "");
    const m = opts.messages?.[id];
    if (!m) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({
      id,
      labelIds: m.unread ? ["INBOX", "UNREAD"] : ["INBOX"],
      payload: { headers: [
        { name: "From", value: m.from },
        { name: "Subject", value: m.subject },
        ...(m.date ? [{ name: "Date", value: m.date }] : [])
      ] },
      snippet: m.snippet
    }), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetchImpl, get sawBearer() { return sawBearer; } };
}

describe("GmailEmailProvider.listRecent", () => {
  it("reads + parses the inbox over the Gmail REST API, marking unread", async () => {
    const { fetchImpl, calls } = gmailFetch({
      ids: ["m1", "m2"],
      messages: {
        m1: { from: "Alice <alice@x.com>", subject: "Q3 plan", date: "Mon, 19 May 2026 09:00:00", snippet: "draft attached", unread: true },
        m2: { from: "Bob <bob@y.com>", subject: "lunch?", snippet: "free at noon", unread: false }
      }
    });
    const provider = new GmailEmailProvider("tok-123", fetchImpl);
    const inbox = await provider.listRecent(10);
    expect(inbox).toEqual([
      { from: "Alice <alice@x.com>", id: "m1", snippet: "draft attached", subject: "Q3 plan", unread: true, date: "Mon, 19 May 2026 09:00:00" },
      { from: "Bob <bob@y.com>", id: "m2", snippet: "free at noon", subject: "lunch?", unread: false }
    ]);
    // Hit INBOX list + one metadata get per message.
    expect(calls.some((c) => c.includes("/messages?maxResults=10&labelIds=INBOX"))).toBe(true);
    expect(calls.filter((c) => c.includes("/messages/")).length).toBe(2);
  });

  it("sends the Bearer access token on every request", async () => {
    const fake = gmailFetch({ ids: ["m1"], messages: { m1: { from: "a@x", subject: "s", snippet: "x", unread: false } } });
    await new GmailEmailProvider("secret-token", fake.fetchImpl).listRecent(5);
    expect(fake.sawBearer).toBe(true);
  });

  it("throws a clear auth error on 401/403 (expired/missing token)", async () => {
    const { fetchImpl } = gmailFetch({ authError: 401 });
    await expect(new GmailEmailProvider("bad", fetchImpl).listRecent(5)).rejects.toThrow(/Gmail auth rejected \(401\)/u);
  });

  it("returns empty for an empty inbox", async () => {
    const { fetchImpl } = gmailFetch({ ids: [] });
    expect(await new GmailEmailProvider("tok", fetchImpl).listRecent(5)).toEqual([]);
  });
});

describe("summarizeInbox", () => {
  const msg = (over: Partial<EmailSummary>): EmailSummary => ({ from: "x@y", id: "i", snippet: "", subject: "s", unread: false, ...over });

  it("reports counts and lists unread subjects", () => {
    const summary = summarizeInbox([
      msg({ id: "1", from: "Alice", subject: "Q3 plan", unread: true }),
      msg({ id: "2", from: "Bob", subject: "lunch", unread: false }),
      msg({ id: "3", from: "Carol", subject: "invoice", unread: true })
    ]);
    expect(summary).toContain("3 messages, 2 unread");
    expect(summary).toContain("“Q3 plan” — Alice");
    expect(summary).toContain("“invoice” — Carol");
    expect(summary).not.toContain("lunch");
  });

  it("says all-read when nothing is unread, and empty when empty", () => {
    expect(summarizeInbox([msg({ unread: false })])).toBe("1 message, 0 unread.");
    expect(summarizeInbox([])).toBe("Inbox empty.");
  });
});

describe("unreadBriefingLine", () => {
  const msg = (over: Partial<EmailSummary>): EmailSummary => ({ from: "x@y", id: "i", snippet: "", subject: "s", unread: false, ...over });

  it("returns undefined when nothing is unread (briefing stays quiet about a clean inbox)", () => {
    expect(unreadBriefingLine([msg({ unread: false })])).toBeUndefined();
    expect(unreadBriefingLine([])).toBeUndefined();
  });

  it("names up to 3 unread subjects with sender display-names and a +N more tail", () => {
    const line = unreadBriefingLine([
      msg({ id: "1", from: "Alice <a@x.com>", subject: "Q3 plan", unread: true }),
      msg({ id: "2", from: "Bob <b@y.com>", subject: "invoice", unread: true }),
      msg({ id: "3", from: "carol@z.com", subject: "review", unread: true }),
      msg({ id: "4", from: "Dave <d@w.com>", subject: "ping", unread: true })
    ]);
    expect(line).toBe("4 unread — “Q3 plan” (Alice), “invoice” (Bob), “review” (carol@z.com), +1 more");
  });
});
