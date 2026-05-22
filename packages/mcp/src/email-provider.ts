/**
 * Read-only email ingest behind a model-neutral abstraction (the way
 * calendar / weather did). `GmailEmailProvider` reads the inbox over
 * the Gmail REST API (HTTP, Bearer access token) — no SDK, no new dep.
 *
 * READ ONLY. Reading the inbox is world-sensing, so no outbound-safety
 * gate applies (`.claude/rules/outbound-safety.md` governs only
 * actions toward a third party). Sending / replying is a separate,
 * draft-first + gated capability and lives elsewhere.
 *
 * Lives in @muse/mcp so both the CLI (`muse inbox`) and the proactive
 * briefing daemon (needs-reply surfacing) can reuse it.
 */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface EmailSummary {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly snippet: string;
  readonly date?: string;
  readonly unread: boolean;
}

export interface EmailProvider {
  /** Most-recent inbox messages, newest first (provider order). */
  listRecent(limit: number): Promise<readonly EmailSummary[]>;
}

function header(headers: ReadonlyArray<Record<string, unknown>>, name: string): string {
  const match = headers.find((h) => typeof h.name === "string" && h.name.toLowerCase() === name.toLowerCase());
  return match && typeof match.value === "string" ? match.value : "";
}

export class GmailEmailProvider implements EmailProvider {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch
  ) {}

  private async get(url: string): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(url, { headers: { authorization: `Bearer ${this.accessToken}` } });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Gmail auth rejected (${response.status.toString()}) — the access token is missing, expired, or lacks gmail.readonly scope`);
    }
    if (!response.ok) {
      throw new Error(`Gmail API ${response.status.toString()}`);
    }
    return await response.json() as Record<string, unknown>;
  }

  async listRecent(limit: number): Promise<readonly EmailSummary[]> {
    const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 10;
    const list = await this.get(`${GMAIL_BASE}/messages?maxResults=${max.toString()}&labelIds=INBOX`);
    const ids = Array.isArray(list.messages)
      ? (list.messages as Array<Record<string, unknown>>).flatMap((m) => (typeof m.id === "string" ? [m.id] : []))
      : [];
    const out: EmailSummary[] = [];
    for (const id of ids) {
      const params = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date";
      const msg = await this.get(`${GMAIL_BASE}/messages/${encodeURIComponent(id)}?${params}`);
      const payload = (msg.payload ?? {}) as { headers?: ReadonlyArray<Record<string, unknown>> };
      const headers = Array.isArray(payload.headers) ? payload.headers : [];
      const labelIds = Array.isArray(msg.labelIds) ? msg.labelIds : [];
      const dateHeader = header(headers, "Date");
      out.push({
        from: header(headers, "From"),
        id,
        snippet: typeof msg.snippet === "string" ? msg.snippet : "",
        subject: header(headers, "Subject"),
        unread: labelIds.includes("UNREAD"),
        ...(dateHeader ? { date: dateHeader } : {})
      });
    }
    return out;
  }
}

/**
 * One-line triage summary of an inbox snapshot — "12 messages, 3
 * unread" — plus the unread subjects. Pure so the CLI / briefing can
 * render it and a test can pin it without HTTP.
 */
export function summarizeInbox(messages: readonly EmailSummary[]): string {
  const unread = messages.filter((m) => m.unread);
  if (messages.length === 0) {
    return "Inbox empty.";
  }
  const head = `${messages.length.toString()} message${messages.length === 1 ? "" : "s"}, ${unread.length.toString()} unread`;
  if (unread.length === 0) {
    return `${head}.`;
  }
  const subjects = unread.slice(0, 5).map((m) => `“${m.subject || "(no subject)"}” — ${m.from || "(unknown)"}`);
  return `${head}. Unread:\n${subjects.map((s) => `  - ${s}`).join("\n")}`;
}
