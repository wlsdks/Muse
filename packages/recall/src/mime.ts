/**
 * Lean, dependency-free RFC822/MIME primitives — header unfolding,
 * quoted-printable / base64 decoding, multipart body extraction, HTML
 * stripping. Best-effort by design: the goal is searchable, citable text
 * (grounding corpus), not a faithful mail client. Shared by the `.eml`
 * document reader here and the CLI's `.mbox` ingest.
 */

export interface ParsedHeaders {
  readonly headers: ReadonlyMap<string, string>;
  readonly body: string;
}

/** Split a message into unfolded headers + body. Header names are lowercased. */
export function parseHeaders(rawMessage: string): ParsedHeaders {
  const lines = rawMessage.split(/\r?\n/);
  const headers = new Map<string, string>();
  let i = 0;
  let lastKey: string | undefined;
  for (; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim().length === 0) { i += 1; break; } // blank line ends headers
    if (/^[ \t]/u.test(line) && lastKey) {
      headers.set(lastKey, `${headers.get(lastKey) ?? ""} ${line.trim()}`); // folded continuation
      continue;
    }
    const m = /^([!-9;-~]+):\s?(.*)$/u.exec(line); // header-name: value
    if (m) {
      lastKey = m[1]!.toLowerCase();
      headers.set(lastKey, m[2] ?? "");
    }
  }
  return { body: lines.slice(i).join("\n"), headers };
}

function decodeQuotedPrintable(text: string): string {
  const noSoftBreaks = text.replace(/=\r?\n/gu, "");
  const bytes: number[] = [];
  for (let i = 0; i < noSoftBreaks.length;) {
    if (noSoftBreaks[i] === "=" && /^[0-9A-Fa-f]{2}$/u.test(noSoftBreaks.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(noSoftBreaks.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      for (const b of Buffer.from(noSoftBreaks[i]!, "utf8")) bytes.push(b);
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeBase64(text: string): string {
  try {
    return Buffer.from(text.replace(/\s+/gu, ""), "base64").toString("utf8");
  } catch {
    return text;
  }
}

/** Strip HTML to readable text: drop script/style, tags → space, decode a few entities. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&quot;/giu, "\"").replace(/&#39;/giu, "'")
    .replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
}

function decodePart(body: string, contentType: string, cte: string): string {
  let decoded = body;
  if (/quoted-printable/iu.test(cte)) decoded = decodeQuotedPrintable(body);
  else if (/base64/iu.test(cte)) decoded = decodeBase64(body);
  if (/text\/html/iu.test(contentType)) decoded = stripHtml(decoded);
  return decoded;
}

/**
 * Best-effort body extraction. Multipart → pick the first text/plain part
 * (else the first text/html, stripped); single part → decode per its CTE.
 * One level of multipart is handled; nested/attachment parts are skipped.
 */
export function extractBody(parsed: ParsedHeaders): string {
  const contentType = parsed.headers.get("content-type") ?? "";
  const cte = parsed.headers.get("content-transfer-encoding") ?? "";
  const boundaryMatch = /boundary="?([^";\r\n]+)"?/iu.exec(contentType);
  if (/multipart\//iu.test(contentType) && boundaryMatch) {
    const boundary = boundaryMatch[1]!;
    const rawParts = parsed.body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:--)?`, "u"));
    const parts = rawParts.map((p) => parseHeaders(p.replace(/^\r?\n/u, "")));
    const plain = parts.find((p) => /text\/plain/iu.test(p.headers.get("content-type") ?? ""));
    const html = parts.find((p) => /text\/html/iu.test(p.headers.get("content-type") ?? ""));
    const chosen = plain ?? html;
    if (chosen) {
      return decodePart(chosen.body, chosen.headers.get("content-type") ?? "", chosen.headers.get("content-transfer-encoding") ?? "").trim();
    }
  }
  return decodePart(parsed.body, contentType, cte).trim();
}

/** Decode RFC-2047 encoded-words in a header value (Subject etc.), best-effort. */
export function decodeHeaderValue(value: string): string {
  return value.replace(/=\?[^?]+\?([bBqQ])\?([^?]*)\?=/gu, (_m, enc: string, data: string) => {
    if (enc.toLowerCase() === "b") return decodeBase64(data);
    return decodeQuotedPrintable(data.replace(/_/gu, " "));
  }).trim();
}
