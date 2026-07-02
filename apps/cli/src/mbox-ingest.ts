/**
 * `.mbox` mail → markdown notes, for `muse ingest`. Email is the
 * privacy-bound beachhead's biggest "I know I wrote it somewhere" corpus, and
 * it's exactly the data they'd never paste into a cloud assistant. This is a
 * LEAN, dependency-free, best-effort parser: it splits the mbox, reads the
 * key headers (From/To/Subject/Date), and extracts the plaintext body
 * (quoted-printable / base64 decoded, simple multipart text part picked, HTML
 * tag-stripped). It deliberately skips attachments and deep nested MIME — the
 * goal is searchable, citable text, not a faithful mail client. Each message
 * becomes one note the existing reindex + cited-recall pipeline picks up.
 */

import { decodeHeaderValue, extractBody, parseHeaders } from "@muse/recall";

import type { IngestedConversation } from "./chat-export-ingest.js";
import { slugifyTitle } from "./chat-export-ingest.js";

/** True when the raw text looks like an mbox (starts with a "From " separator line). */
export function looksLikeMbox(raw: string): boolean {
  return /^From .+(\r?\n|$)/u.test(raw.replace(/^\uFEFF/u, ""));
}

/**
 * Split an mbox into raw message blocks. The mbox separator is a line that
 * starts with "From " at the START of a message (file start, or after a blank
 * line) — this avoids splitting on a "From " that merely appears inside a body.
 */
export function splitMboxMessages(raw: string): readonly string[] {
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/);
  const messages: string[] = [];
  let current: string[] | undefined;
  let prevBlank = true; // file start counts as "after a blank line"
  for (const line of lines) {
    if (/^From .+/u.test(line) && prevBlank) {
      if (current && current.join("\n").trim().length > 0) messages.push(current.join("\n"));
      current = [];
    } else {
      (current ??= []).push(line);
    }
    prevBlank = line.trim().length === 0;
  }
  if (current && current.join("\n").trim().length > 0) messages.push(current.join("\n"));
  return messages;
}

export { decodeHeaderValue, extractBody, parseHeaders, stripHtml, type ParsedHeaders } from "@muse/recall";

export function ingestMbox(raw: string): readonly IngestedConversation[] {
  const out: IngestedConversation[] = [];
  splitMboxMessages(raw).forEach((rawMsg, index) => {
    const parsed = parseHeaders(rawMsg);
    const subject = decodeHeaderValue(parsed.headers.get("subject") ?? "").trim() || `Email ${(index + 1).toString()}`;
    const from = decodeHeaderValue(parsed.headers.get("from") ?? "").trim();
    const to = decodeHeaderValue(parsed.headers.get("to") ?? "").trim();
    const date = (parsed.headers.get("date") ?? "").trim();
    const body = extractBody(parsed);
    if (body.length === 0 && from.length === 0) return; // nothing usable
    const metaBits = [from && `From: ${from}`, to && `To: ${to}`, date && date].filter((b): b is string => Boolean(b));
    const markdown = `# ${subject}\n\n_Email${metaBits.length ? ` — ${metaBits.join(" · ")}` : ""}_\n\n${body}\n`;
    const createdIso = ((): string | undefined => {
      const t = Date.parse(date);
      return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
    })();
    out.push({ ...(createdIso ? { createdIso } : {}), markdown, slug: slugifyTitle(subject, `email-${(index + 1).toString()}`), title: subject });
  });
  // De-collide slugs (many emails share a subject like "Re: lunch").
  const seen = new Map<string, number>();
  return out.map((c) => {
    const n = (seen.get(c.slug) ?? 0) + 1;
    seen.set(c.slug, n);
    return n === 1 ? c : { ...c, slug: `${c.slug}-${n.toString()}` };
  });
}
