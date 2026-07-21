export interface JudgeStringArrayParseResult {
  readonly values: readonly string[];
  /**
   * False when the raw output carried no valid top-level JSON array at all
   * (unparseable / timed-out / malformed) — a distinct failure from the
   * model validly returning `[]` (a genuine "nothing matches"). Callers that
   * collapse the two report a judge failure as a confident "no results".
   */
  readonly parsed: boolean;
}

// LLM judge output often wraps the JSON array in prose (preamble/trailer);
// only the first balanced top-level array is trustworthy — anything else is discarded.
export function parseJudgeStringArrayDiagnostic(raw: string): JudgeStringArrayParseResult {
  const first = raw.indexOf("[");
  if (first < 0) return { parsed: false, values: [] };
  let depth = 0;
  let body = "";
  for (let i = first; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        body = raw.slice(first, i + 1);
        break;
      }
    }
  }
  if (!body) return { parsed: false, values: [] };
  let parsed: unknown;
  try { parsed = JSON.parse(body) as unknown; } catch { return { parsed: false, values: [] }; }
  if (!Array.isArray(parsed)) return { parsed: false, values: [] };
  return {
    parsed: true,
    values: parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
  };
}

export function parseJudgeStringArray(raw: string): readonly string[] {
  return parseJudgeStringArrayDiagnostic(raw).values;
}
