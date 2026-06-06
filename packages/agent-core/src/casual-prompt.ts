/**
 * Deterministic casual / social-prompt detector for the recall surface. A bare
 * "hi" / "thanks" / "bye" is NOT a question about the user's notes, yet it
 * currently runs the whole grounding pipeline — retrieval, the empty-corpus
 * on-ramp, a fabricated `[action: …]` citation the gate then strips, and a
 * "treat as unverified" grounding warning on the word "Hello!". tool-calling.md
 * is explicit: do not invoke the retrieval machinery on a greeting. This
 * classifies a PURE social prompt so the caller can answer it conversationally
 * and skip all of that.
 *
 * PRECISION-FIRST: only a short query whose WHOLE content is a social phrase
 * matches (anchored), so "hi, what's my rent?" or "thanks — when is the dentist?"
 * fall through to the normal grounded path. A miss costs nothing (normal path);
 * a false positive would skip grounding on a real question, so the bar is high.
 */

export type CasualPromptKind = "greeting" | "thanks" | "farewell";

const CASUAL_PATTERNS: ReadonlyArray<{ readonly kind: CasualPromptKind; readonly re: RegExp }> = [
  { kind: "greeting", re: /^(hi+|hey+|hello+|helo|yo|hiya|howdy|sup|gm|good morning|good evening|good afternoon|안녕|안녕하세요|하이|헬로|여보세요|좋은\s?아침|좋은\s?저녁|좋은\s?밤|좋은\s?오후|좋은\s?하루|굿모닝|굿이브닝)( there| muse|이야|이에요|예요|요|입니다|하세요)?$/u },
  { kind: "thanks", re: /^(thanks?|thank you|thanks a lot|thank u|thx|ty|tysm|cheers|much appreciated|appreciate it|고마워|고마워요|고맙습니다|감사|감사해|감사해요|감사합니다|땡큐|수고(했어|했어요|하셨어요|해)?)$/u },
  { kind: "farewell", re: /^(bye+|bye bye|goodbye|good bye|see you|see ya|see you later|cya|later|good ?night|take care|잘있어|잘 있어|안녕히|안녕히 계세요|잘가|잘 가|바이|다음에 봐|잘\s?자(요|라)?|굿나잇|굿밤|푹\s?자(요)?)$/u }
];

function normalizeSocialPrompt(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[!?.…~,\s]+$/u, "")
    .replace(/\s+/gu, " ");
}

/**
 * The social kind of a prompt, or `null` for anything that carries an actual
 * request. Normalises case, collapses whitespace, and strips trailing social
 * punctuation ("hi!!!" → "hi") before matching the anchored patterns. A query
 * longer than 30 chars is never casual (it carries content).
 */
export function classifyCasualPrompt(query: string): CasualPromptKind | null {
  const normalized = normalizeSocialPrompt(query);
  if (normalized.length === 0 || normalized.length > 30) {
    return null;
  }
  for (const { kind, re } of CASUAL_PATTERNS) {
    if (re.test(normalized)) {
      return kind;
    }
  }
  return null;
}

// A self-referential question ABOUT Muse ("what can you do", "넌 뭐야") — not a
// question about the user's notes. The local model otherwise free-composes an
// aspirational, often OVER-CLAIMED answer ("I can manage your schedule…") and
// gets a grounding warning. Anchored so "what can you do about my taxes" or
// "how do you cook rice" never match — only a whole-query meta phrase does.
const META_PROMPT_RE =
  /^(what can you (do|help( me)? with)|what do you do|what are you|who are you|what'?s? (is )?muse|how (do|does) (you|this|it) work|what can (i|you) ask|help|뭐\s?할\s?수\s?있어|무엇을?\s?할\s?수\s?있어|넌?\s?뭐야|너\s?뭐야|어떻게\s?(작동|동작)해|도움말|사용법)$/u;

/** True when the prompt asks about MUSE ITSELF (capabilities / identity / usage). */
export function classifyMetaPrompt(query: string): boolean {
  const normalized = normalizeSocialPrompt(query);
  if (normalized.length === 0 || normalized.length > 40) {
    return false;
  }
  return META_PROMPT_RE.test(normalized);
}

// A request to OVERVIEW the whole note corpus ("what's in my notes?", "summarize
// my notes", "list my notes", "what notes do I have") rather than a specific
// question. Top-K recall ranks every note weakly for such an aggregate query, so
// the confidence gate refuses and the warm-close tells a user WHO HAS NOTES to
// "add a note" — which is nonsensical. Detect it so the caller can list the
// corpus instead. Each pattern anchors the overview verb DIRECTLY on "(my)
// notes" (no topic between), so "summarize my VPN notes" (a subset) doesn't match.
const OVERVIEW_PATTERNS: readonly RegExp[] = [
  /\b(summar(y|ise|ize)|overview|list|show|catalog|inventory|recap)\s+(me\s+|of\s+)?(all\s+)?(my\s+|the\s+)?notes\b/u,
  /\bwhat'?s\s+in\s+(all\s+)?(my\s+)?notes\b/u,
  /\bwhat\s+(notes\s+(do\s+i\s+have|are\s+there|exist)|do\s+i\s+have\s+(in\s+)?(my\s+)?notes)\b/u,
  /\b(how\s+many|which)\s+notes\b/u,
  /(내|제)\s*노트(들)?\s*(요약|목록|뭐|어떤|몇|있|정리)/u,
  /노트\s*(목록|요약|정리)/u
];

// An IMPERATIVE request to DO something (set a reminder, add a task, send an
// email) rather than a question. On the chat-only (no-tools) path the model
// happily says "I'll remind you…" — a FALSE PROMISE, because nothing was
// actually done. Detect it so the caller can honestly point the user at the
// `--with-tools` path that can actually act. Anchored on the action verb at the
// start (after an optional polite/request lead) so a QUESTION about an action
// ("what reminders do I have?", "when is my dentist reminder?") does NOT match.
const ACTION_REQUEST_RE =
  /^(please\s+|pls\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|i'?d?\s+(like|want)\s+(you\s+)?to\s+)?(remind\s+me|set\s+(up\s+)?(an?\s+)?reminder|add\s+(an?\s+)?(reminder|task|to-?do|event)|create\s+(an?\s+)?(reminder|task|event)|make\s+(an?\s+)?(reminder|task|note)|schedule\s+(an?\s+)?\w|book\s+\w|email\s+\w|send\s+\w+\s+(an?\s+)?(email|message|text|note)|text\s+\w|message\s+\w)/u;

/** True when the prompt is an imperative request to DO something (needs tools), not a question. */
export function classifyActionRequest(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0 || q.length > 120) {
    return false;
  }
  return ACTION_REQUEST_RE.test(q);
}

// The ANSWER claims it performed (or will perform) a tool action — "I'll remind
// you…", "I've set a reminder", "I'll add a task". On the chat-only path nothing
// was actually done, so this is a FALSE PROMISE. Keyed off the answer (not the
// query) so it ALSO catches a MIXED "what's my rent AND remind me to pay it
// tomorrow" that classifyActionRequest (anchored at the start) misses. Anchored
// on the action-TOOL verbs (remind/reminder/task/event/schedule/book/email), so
// conversational "I'll add it to your notes" / "I'll explain" don't match.
const ACTION_PROMISE_RE =
  /\bi(?:'ll| will|'m going to| am going to)\s+(remind\s+you|set\s+(up\s+)?(an?\s+)?reminder|schedule\b|book\b|email\s+\w|send\s+\w+\s+(an?\s+)?(email|message|text)|add\s+(an?\s+)?(task|event|reminder|to-?do)|create\s+(an?\s+)?(task|event|reminder)|put\s+[^.]*\bon\b[^.]*\bcalendar)|\bi(?:'ve| have)\s+(set\s+(up\s+)?(an?\s+)?reminder|added\s+(an?\s+)?(task|event|reminder)|scheduled\b|booked\b|emailed\b|created\s+(an?\s+)?(task|event|reminder))/iu;

/** True when the answer CLAIMS it set/sent/scheduled a tool action — a false promise on a no-tools path. */
export function answerPromisesAction(answer: string): boolean {
  return ACTION_PROMISE_RE.test(answer);
}

/** True when the prompt asks for a whole-corpus overview/listing, not a specific recall. */
export function classifyCorpusOverview(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0 || q.length > 80) {
    return false;
  }
  // A topic after "notes" makes it a SPECIFIC question, not a corpus overview.
  if (/\bnotes\s+(about|on|regarding|for|concerning|covering|re)\b/u.test(q)) {
    return false;
  }
  return OVERVIEW_PATTERNS.some((re) => re.test(q));
}
