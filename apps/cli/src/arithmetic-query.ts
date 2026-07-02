/**
 * `muse ask`'s pure-arithmetic fast-path detector. The local 8B can't multiply
 * reliably (it confidently returns the wrong digits), so when a query is nothing
 * BUT a calculation, Muse should compute it deterministically rather than letting
 * the model guess. These helpers decide whether a query qualifies and format the
 * exact answer; the evaluation itself routes through `@muse/mcp`'s
 * `evaluateArithmeticExpression`.
 */

const QUESTION_FRAMING =
  /^(?:what(?:\s+is|'s|\s+are)?|whats|calculate|compute|evaluate|how\s+much\s+is|equals?)\s+/u;

// Polite/instruction framing around the calculation — a live probe showed
// "간단히 계산해줘: 3+4" falling through to the grounded path and REFUSING
// grade-school math ("제공된 정보에 없습니다") purely because of phrasing.
// Each token may carry a trailing ":" or ",". Precision holds because the
// remaining core must STILL be all-symbolic with a real operator — framing
// words followed by a notes question ("간단히 내 예산 알려줘") never qualify.
const LEADING_FRAMING_TOKEN =
  /^(?:please|quickly|just|hey|can\s+you|could\s+you|간단히|간단하게|빨리|그냥|이거|자|얼른|계산(?:해\s*줘|해\s*봐|하면|해)?|암산(?:해\s*줘|해)?|산수)\s*[:,]?\s*/iu;
const TRAILING_FRAMING_TOKEN =
  /\s*(?:얼마(?:야|지|예요|에요|인가요|인가|임|니|죠)?|몇(?:이야|이지|인가요|이니|이냐)?|뭐(?:야|지|예요|에요|죠|냐)?|무엇(?:인가요|이죠|입니까)?|알려\s*줘(?:요)?|알려\s*줄래|계산해\s*줘(?:요)?|말해\s*줘(?:요)?|해\s*줘(?:요)?|please|equals?\s*(?:to|what)?|is\s+what)\s*[.!?]?\s*$/iu;
// A trailing Korean topic/subject particle after an operand or between framing
// suffixes ("3+4는 얼마야" → "3+4는" → "3+4").
const TRAILING_PARTICLE = /([\d)])\s*(?:은|는|이|가)$/u;

/**
 * Return the bare arithmetic expression if `query` is PURELY a calculation
 * ("what is 1847 * 2963?", "2+2", "calculate (1200 + 850) / 2") — else null.
 * Precision-first: the remainder after stripping the "what is …?" framing must
 * contain only digits / parentheses / `.` / `,` / `+ - * / %` AND a real binary
 * operator, so a notes question ("what is my Q3 budget?", "what is 42?") never
 * short-circuits the retrieval path.
 */
export function detectArithmeticQuery(query: string): string | null {
  let q = query.trim().toLowerCase();
  q = q.replace(/[?\s]+$/u, "");
  for (let previous = ""; previous !== q; ) {
    previous = q;
    q = q.replace(LEADING_FRAMING_TOKEN, "").trimStart();
  }
  q = q.replace(QUESTION_FRAMING, "");
  for (let previous = ""; previous !== q; ) {
    previous = q;
    q = q.replace(TRAILING_FRAMING_TOKEN, "").replace(TRAILING_PARTICLE, "$1").replace(/[?\s]+$/u, "").trimEnd();
  }
  q = q.replace(/\s*=\s*$/u, "").trim();
  // Natural-language operators → symbols, so "12 times 4" / "17 곱하기 6은" reach
  // the deterministic evaluator just like "12 * 4" — the 8B mis-multiplies either
  // spelling. The all-symbolic check below still rejects anything left with
  // letters, so a sentence that merely contains "times"/"minus" never qualifies.
  q = q
    .replace(/\bmultiplied\s+by\b/gu, "*")
    .replace(/\bdivided\s+by\b/gu, "/")
    .replace(/\btimes\b/gu, "*")
    .replace(/\bplus\b/gu, "+")
    .replace(/\bminus\b/gu, "-")
    .replace(/곱하기/gu, "*")
    .replace(/더하기/gu, "+")
    .replace(/빼기/gu, "-")
    .replace(/나누기/gu, "/")
    .replace(/([\d)])\s*(은|는|이|가)$/u, "$1") // drop a trailing Korean topic particle
    .trim();
  if (q.length === 0 || q.length > 256) {
    return null;
  }
  if (!/^[\d\s+\-*/().,%]+$/u.test(q)) {
    return null;
  }
  // A bare number ("42") or a lone negative ("-5") is not a calculation — require
  // a binary operator that actually follows an operand.
  if (!/[\d)]\s*[-+*/%]/u.test(q)) {
    return null;
  }
  return q;
}

/** "1847 * 2963 = 5,472,661" — the exact computed answer, the result grouped for readability. */
export function formatArithmeticResult(expression: string, result: number): string {
  const shown = Number.isInteger(result)
    ? result.toLocaleString("en-US")
    : result.toLocaleString("en-US", { maximumFractionDigits: 10 });
  return `${expression} = ${shown}`;
}
