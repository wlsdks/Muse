/**
 * Deterministic channel conversational-vs-delegation classifier. A channel
 * message that isn't one of the three canned casual kinds
 * (`classifyCasualPrompt`) today runs the FULL agent pipeline even when it is
 * plainly small talk ("오늘 좀 피곤하네 ㅋㅋ", "요즘 어때?") — this classifies
 * that gap so the caller can answer it with a single-inference fast reply
 * instead.
 *
 * FAIL-SAFE DIRECTION IS SACRED: a chat message misrouted to delegation only
 * costs latency (the full pipeline still answers it correctly); a delegation
 * misrouted to chat gives the user a shallow, un-grounded reply to a real
 * request. So this is TRIPLE-GATED and the default is always "delegation" —
 * "chat" is returned only when ALL THREE hold:
 *   (a) no delegation signal — an imperative/actuator/request verb (KO/EN),
 *       an information-seeking interrogative ("어디"/"언제"/"뭐야"/"what is"),
 *       an explicit reference to the user's stored data ("내 일정"/"my
 *       calendar"), or a RECALL interrogative asking what happened / was
 *       decided ("내 주말 어땠지?", "날씨 어때 내일?" — a topic-noun question,
 *       not smalltalk about the topic),
 *   (b) at least one conversational signal — a mood/smalltalk lexicon hit, or
 *       the WHOLE message is a bare interjection/exclamation,
 *   (c) the message is short (≤ 80 chars after trim).
 * Anything that doesn't clear all three — including a neutral statement that
 * matches neither list — falls through to "delegation", the safe default.
 */

export type ChannelIntent = "chat" | "delegation";

/** Messages longer than this are never "chat" — a genuine conversational aside is short. */
export const CHANNEL_CHAT_MAX_LENGTH = 80;

// (a) Any ONE of these means "this carries a real ask" — imperative/actuator
// verbs, information-seeking interrogatives, and explicit stored-data
// references. Matching ANY of them forces "delegation" regardless of (b)/(c).
const KO_DELEGATION_SIGNAL_PATTERNS: readonly RegExp[] = [
  /해\s?줘/u,
  /줘/u,
  /해봐/u,
  /추가/u,
  /삭제/u,
  /지워/u,
  /만들/u,
  /보내/u,
  /예약/u,
  /정리/u,
  /요약/u,
  /알려/u,
  /찾아/u,
  /검색/u,
  /기억/u,
  /리마인드/u,
  /확인해/u,
  /어디/u,
  /언제/u,
  /뭐야/u,
  /뭐지/u,
  // Explicit reference to the user's stored data ("내 일정", "제 리마인더").
  /(?:내|제)\s*(?:일정|스케줄|캘린더|할\s*일|할일|투두|태스크|메모|노트|리마인더|알림)/u
];
const EN_DELEGATION_SIGNAL_PATTERNS: readonly RegExp[] = [
  /\bremind\b/iu,
  /\badd\b/iu,
  /\bcreate\b/iu,
  /\bsend\b/iu,
  /\bschedule\b/iu,
  /\bbook\b/iu,
  /\bfind\b/iu,
  /\bsearch\b/iu,
  /\bsummarize\b/iu,
  /\blist\b/iu,
  /\bshow\b/iu,
  /\bcheck\b/iu,
  /\bset\b/iu,
  /\bdelete\b/iu,
  /\bremove\b/iu,
  /\btell me\b/iu,
  /\bwhat'?s\b/iu,
  /\bwhat is\b/iu,
  /\bwhen'?s\b/iu,
  /\bwhen is\b/iu,
  // Explicit reference to the user's stored data ("my calendar", "my tasks").
  /\bmy\s+(?:calendar|schedule|tasks?|to-?dos?|notes?|reminders?)\b/iu
];
const DELEGATION_SIGNAL_PATTERNS: readonly RegExp[] = [...KO_DELEGATION_SIGNAL_PATTERNS, ...EN_DELEGATION_SIGNAL_PATTERNS];

// A RECALL interrogative — the user is asking Muse to remember something
// that happened ("내 주말 어땠지?", "나 어제 뭐 했었지?") or was decided
// ("주말에 나 뭐 하기로 했지?"). This is a personal-recall REQUEST the full
// grounded path can answer with citations; the chat fast-path must never
// intercept it (it would have Muse deny its own recall capability). A
// past-tense "-지" ending, "하기로 했" (decided to), "뭐였" (what was), or
// "어땠" (how was, past tense — distinct from the present-tense "어때" the
// conversational lexicon still allows) is unambiguously a recall ask.
const RECALL_INTERROGATIVE_RE = /(었|았|였|했)지\??$|하기로\s?했|뭐였|어땠/u;

// A question-form ending ("?", or a KO interrogative-ending token at the
// very end of the trimmed message) combined with a small, closed set of
// TOPIC nouns Muse tracks as data (주말/날씨/일정/약속/계획) is a recall/
// lookup request ("날씨 어때 내일?"), not smalltalk — even though the ending
// alone (e.g. "지") is too broad to be a signal on its own.
const QUESTION_FORM_ENDING_RE = /(?:[?？]|지|까|나요|어때)[?？]?[\s.!~]*$/u;
const RECALL_TOPIC_NOUN_RE = /주말|날씨|일정|약속|계획/u;

function hasRecallInterrogativeSignal(text: string): boolean {
  if (RECALL_INTERROGATIVE_RE.test(text)) {
    return true;
  }
  return QUESTION_FORM_ENDING_RE.test(text) && RECALL_TOPIC_NOUN_RE.test(text);
}

function hasDelegationSignal(text: string): boolean {
  return DELEGATION_SIGNAL_PATTERNS.some((re) => re.test(text)) || hasRecallInterrogativeSignal(text);
}

// (b) Mood / smalltalk lexicon — emotion words + meal chatter + KO laughter/
// crying tokens. NOTE: 주말 ("weekend") and 날씨 ("weather") are deliberately
// NOT here — they are TOPIC nouns (what a recall question is ABOUT), not mood
// words, and including them let a genuine recall ask ("내 주말 어땠지?", "날씨
// 어때 내일?") slip through as smalltalk (fixed defect — see
// `hasRecallInterrogativeSignal` above, which is what correctly routes those
// to delegation instead). A message that merely MENTIONS the weekend in an
// actually-casual way ("이번 주말 진짜 기대된다ㅎㅎ") still classifies chat via
// its OTHER conversational signal (ㅎㅎ here) — losing 주말/날씨 as a lexicon
// entry only removes cases that had NO other casual signal, which is exactly
// the safe direction (delegation) for an ambiguous topic-noun-only message.
const CONVERSATIONAL_LEXICON_PATTERNS: readonly RegExp[] = [
  /피곤/u,
  /기분/u,
  /심심/u,
  /졸리/u,
  /배고/u,
  /우울/u,
  /신나/u,
  /재밌/u,
  /힘들/u,
  /바빴/u,
  /점심/u,
  /저녁\s?먹/u,
  /어때/u,
  /잘\s?지내/u,
  /ㅋㅋ/u,
  /ㅎㅎ/u,
  /ㅠㅠ/u,
  /\btired\b/iu,
  /\bbored\b/iu,
  /\bfeeling\b/iu,
  /\bweather\b/iu,
  /\blol\b/iu,
  /\bhaha\b/iu
];

// A pure interjection/exclamation — the WHOLE (trimmed) message is nothing
// but filler words and social punctuation/laughter, so it carries no verb at
// all ("아 진짜", "헐 대박", "와 ㅋㅋ"). Strips every filler token + social
// punctuation from the message; if nothing is left, it was pure interjection.
const INTERJECTION_TOKEN_RE = /아+|와+|오+|음+|흠+|허+|헉+|하+|호+|헤+|진짜|정말|레알|대박|헐|응|ㅇㅋ|ㅇㅇ|ok|okay/giu;
const SOCIAL_PUNCTUATION_RE = /[\s!?.~,ㅋㅎㅠㄷ]+/gu;

function isPureExclamation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const stripped = trimmed.replace(INTERJECTION_TOKEN_RE, "").replace(SOCIAL_PUNCTUATION_RE, "");
  return stripped.length === 0;
}

function hasConversationalSignal(text: string): boolean {
  return CONVERSATIONAL_LEXICON_PATTERNS.some((re) => re.test(text)) || isPureExclamation(text);
}

/**
 * Classify a channel message as "chat" (a single-inference conversational
 * reply is safe) or "delegation" (keep the current ack + full-agent path).
 * See the module doc for the triple-gate and the fail-safe default.
 */
export function classifyChannelIntent(text: string): ChannelIntent {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > CHANNEL_CHAT_MAX_LENGTH) {
    return "delegation";
  }
  if (hasDelegationSignal(trimmed)) {
    return "delegation";
  }
  if (!hasConversationalSignal(trimmed)) {
    return "delegation";
  }
  return "chat";
}
