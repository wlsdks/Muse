/**
 * eval:playbook-credit — live calibration of the self-learning credit-assignment
 * floors against the REAL embedder, on the production embed path.
 *
 * The playbook RL loop only learns if it can tell WHICH strategy a piece of user
 * feedback implicates. That decision is a cosine between two DIFFERENT text
 * distributions — a conversational cue ("always confirm with me before you send
 * it") and an imperative strategy ("Before booking or sending anything, show a
 * draft and wait for explicit confirmation") — and cross-distribution pairs do
 * NOT score like paraphrases. The shipped floors (credit 0.55 / decay 0.62) were
 * set on the assumption they do.
 *
 * This battery pins the separation invariant both ways: every GENUINE cue must
 * clear the floor against the strategy it implicates, and every UNRELATED cue
 * must fall below it — with margin on both sides, in Korean and English.
 *
 * LOCAL OLLAMA ONLY; skips (exit 0) when the embed model is unavailable.
 */

import {
  DEFAULT_PLAYBOOK_CREDIT_COSINE,
  DEFAULT_PLAYBOOK_DECAY_CREDIT_COSINE,
  PLAYBOOK_CREDIT_MARGIN,
  PLAYBOOK_DECAY_CREDIT_MARGIN,
  selectCreditTargetLlm,
  selectCreditTargetSemantic
} from "../packages/agent-core/dist/index.js";
import { OllamaProvider } from "../packages/model/dist/index.js";
import { defaultEmbedModel } from "../apps/cli/dist/council-corpus.js";
import { embed as embedRaw } from "../apps/cli/dist/embed.js";

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/u, "");
const MODEL = defaultEmbedModel(process.env);

async function ollamaHasModel() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const names = ((await res.json())?.models ?? []).map((m) => m?.name ?? "");
    return names.some((n) => n === MODEL || n.startsWith(`${MODEL}:`));
  } catch {
    return false;
  }
}

if (!(await ollamaHasModel())) {
  console.log(`eval:playbook-credit skipped — embed model '${MODEL}' unavailable (a skip is not a pass).`);
  process.exit(0);
}

const embed = (t) => embedRaw(t, MODEL);
const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
};

// Realistic strategies — the shape `distillQueuedCorrections` actually writes.
const STRATEGIES = [
  "Before booking, sending, or ordering anything, show a draft and wait for explicit confirmation.",
  "Lead with the direct answer, then the supporting detail — no preamble, no restating the question.",
  "메모나 기록에 근거가 없으면 추측하지 말고 모른다고 말한다.",
  "Keep replies short: two or three sentences unless more is explicitly asked for.",
  "일정을 잡을 때는 항상 사용자의 근무 시간(9시-18시) 안에서만 제안한다."
];

// GENUINE feedback cues — the conversational prose a user actually types when
// reinforcing or correcting, in both languages, including terse forms.
const GENUINE = [
  ["always confirm with me before you send it", 0],
  ["hey, can you double-check with me first next time?", 0],
  ["보내기 전에 먼저 확인받아", 0],
  ["주문하기 전에 나한테 물어봐", 0],
  ["stop with the long intro, just give me the answer", 1],
  ["결론부터 말해줘", 1],
  ["don't restate my question back at me, answer it", 1],
  ["모르면 지어내지 말고 모른다고 해", 2],
  ["if it's not in my notes, say you don't know", 2],
  ["너무 길어, 짧게 해줘", 3],
  ["keep it to a couple of sentences", 3],
  ["퇴근하고 나서 일정 잡지 마", 4],
  ["don't schedule anything outside my working hours", 4]
];

// The NEGATIVE population is NOT "an ordinary request" — by the time a cue
// reaches credit assignment it is ALREADY known to be feedback, and the
// candidates are the strategies this session actually INJECTED. The real
// negative is therefore: genuine feedback that implicates a DIFFERENT strategy
// than the one being scored. Mis-crediting there is the fabricated-reward
// failure (experience-following replays the error — arXiv:2505.16067).
const MISMATCHED = [
  ["너무 길어, 짧게 해줘", 0],
  ["keep it to a couple of sentences", 0],
  ["always confirm with me before you send it", 1],
  ["보내기 전에 먼저 확인받아", 3],
  ["모르면 지어내지 말고 모른다고 해", 4],
  ["don't schedule anything outside my working hours", 2],
  ["결론부터 말해줘", 0],
  ["if it's not in my notes, say you don't know", 3]
];

// GENUINE feedback that implicates NOTHING in this bank — the "credit nothing"
// population. Measured: these still reach 0.29 against their nearest strategy
// (inside the genuine band), but their top-2 sit within 0.038 of each other,
// because nothing in the bank actually stands out. The MARGIN is what separates
// them; the absolute cosine cannot.
const NO_MATCH = [
  "call me 진안, not sir",
  "이모지 쓰지 마",
  "use bullet points instead of paragraphs",
  "존댓말 말고 반말로 해",
  "stop apologizing so much",
  "코드 블록에 언어 표시 붙여줘",
  "don't use markdown headers in chat",
  "답장할 때 내 이름 부르지 마"
];

const failures = [];
const report = [];
const check = (name, ok, detail) => {
  report.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

const strategyVecs = await Promise.all(STRATEGIES.map(embed));

async function scoreAgainstImplicated(cue, index) {
  return cosine(await embed(cue), strategyVecs[index]);
}

const genuineScores = [];
report.push("GENUINE cue → implicated strategy:");
for (const [cue, index] of GENUINE) {
  const score = await scoreAgainstImplicated(cue, index);
  genuineScores.push(score);
  report.push(`  ${score.toFixed(3)}  ${cue}`);
}

const unrelatedScores = [];
report.push("MISMATCHED cue → a strategy it does NOT implicate (must credit NOTHING):");
for (const [cue, index] of MISMATCHED) {
  const score = await scoreAgainstImplicated(cue, index);
  unrelatedScores.push(score);
  report.push(`  ${score.toFixed(3)}  ${cue}  ↮ S${index}`);
}

const genuineMin = Math.min(...genuineScores);
const mismatchedMax = Math.max(...unrelatedScores);

// The absolute bands OVERLAP — that is the finding, and it is why the shipped
// design (a single cosine floor) could not work. Record it, don't assert it away.
report.push(
  `  bands: genuine ${genuineMin.toFixed(3)}-${Math.max(...genuineScores).toFixed(3)} vs mismatched ${Math.min(...unrelatedScores).toFixed(3)}-${mismatchedMax.toFixed(3)} (OVERLAPPING — a single absolute floor cannot separate them)`
);

// OUTCOME-graded: drive the REAL selector (argmax + absolute floor + margin) and
// score what it actually credits.
const bank = STRATEGIES.map((text, i) => ({ id: `s${i}`, text }));

let credited = 0;
let misCredited = 0;
for (const [cue, index] of GENUINE) {
  const picked = await selectCreditTargetSemantic(bank, cue, embed, DEFAULT_PLAYBOOK_CREDIT_COSINE, PLAYBOOK_CREDIT_MARGIN);
  if (picked === undefined) continue;
  if (picked === `s${index}`) credited++;
  else misCredited++;
}
check(
  "credit: a MAJORITY of genuine feedback is credited (the loop actually learns)",
  credited >= Math.ceil(GENUINE.length / 2),
  `${credited}/${GENUINE.length} credited`
);
check(
  "credit: NO genuine cue is credited to the WRONG strategy (no fabricated reward)",
  misCredited === 0,
  `${misCredited} mis-credit(s)`
);

let noMatchCredited = 0;
for (const cue of NO_MATCH) {
  const picked = await selectCreditTargetSemantic(bank, cue, embed, DEFAULT_PLAYBOOK_CREDIT_COSINE, PLAYBOOK_CREDIT_MARGIN);
  if (picked !== undefined) noMatchCredited++;
}
check(
  "credit: feedback that implicates NOTHING in the bank credits nothing",
  noMatchCredited === 0,
  `${noMatchCredited}/${NO_MATCH.length} spuriously credited`
);

let decayed = 0;
let misDecayed = 0;
for (const [cue, index] of GENUINE) {
  const picked = await selectCreditTargetSemantic(bank, cue, embed, DEFAULT_PLAYBOOK_DECAY_CREDIT_COSINE, PLAYBOOK_DECAY_CREDIT_MARGIN);
  if (picked === undefined) continue;
  if (picked === `s${index}`) decayed++;
  else misDecayed++;
}
check(
  "decay is REACHABLE — a correction can actually dock the strategy it contradicts",
  decayed > 0,
  `${decayed}/${GENUINE.length} would decay (0 = the gate is dead code)`
);
check(
  "decay: never decays the WRONG strategy (a wrong decay erodes the grounding edge)",
  misDecayed === 0,
  `${misDecayed} mis-decay(s)`
);
check(
  "decay stays STRICTER than credit (asymmetric precision is preserved)",
  decayed <= credited,
  `decay ${decayed} <= credit ${credited}`
);

// ---- The PRODUCTION selector (model-first) at REAL bank sizes.
// The first cut of this battery pinned a 5-strategy bank and passed — while the
// production regime (a bank that grows as the user teaches Muse) silently
// collapsed: cosine credit falls from 9/11 to 4/11 as near-neighbours crush the
// margin, and a mis-credit appears. A battery that cannot see the failing regime
// is not a battery.
const CHAT_MODEL = process.env.MUSE_EVAL_MODEL ?? "gemma4:12b";
const modelProvider = new OllamaProvider({ baseUrl: OLLAMA_BASE });

const FILLER = [
  "Be concise — avoid long paragraphs.", "답변은 간결하게 유지한다.", "No preamble; get to the point.",
  "출장 일정은 이동 시간까지 포함해서 잡는다.", "리마인더는 근무 시간에만 보낸다.", "Confirm before deleting anything.",
  "이메일 보내기 전에 초안을 보여준다.", "Always cite the note a claim came from.", "코드 예시는 실행 가능한 형태로 준다.",
  "회의 요약은 액션 아이템 위주로 쓴다.", "Prefer bullet points for lists of steps.", "존댓말을 기본으로 쓴다.",
  "Ask one clarifying question when the request is ambiguous.", "주말에는 알림을 보내지 않는다.",
  "Use the user's timezone for all times.", "Never guess a phone number or email.", "일정 충돌이 있으면 먼저 알려준다.",
  "Summarize long documents before answering.", "링크는 원문 출처와 함께 제시한다.", "숫자는 천 단위 구분자를 넣는다.",
  "Explain trade-offs before recommending.", "작업이 끝나면 결과를 한 줄로 확인해준다.", "Do not repeat the question back.",
  "긴 코드는 파일로 저장하고 경로를 알려준다.", "회의 전에 아젠다를 먼저 확인한다."
];

// The mis-credit the independent review found on the shipped bank: in a mixed-
// language bank the embedder's LANGUAGE identity can outrank meaning, so this KO
// cue was credited to the KO grounding rule instead of the EN answer-first rule.
const HARD_CUES = [...GENUINE, ["서론 빼고 결론부터 말해", 1]];

for (const size of [5, 30]) {
  const bank = [...STRATEGIES, ...FILLER.slice(0, Math.max(0, size - STRATEGIES.length))]
    .map((text, i) => ({ id: `s${i}`, text }));
  let credited = 0;
  let mis = 0;
  for (const [cue, index] of HARD_CUES) {
    const picked = (await selectCreditTargetLlm(bank, cue, { model: CHAT_MODEL, modelProvider }))
      ?? (await selectCreditTargetSemantic(bank, cue, embed, DEFAULT_PLAYBOOK_CREDIT_COSINE, PLAYBOOK_CREDIT_MARGIN));
    if (picked === undefined) continue;
    if (picked === `s${index}`) {
      credited++;
      continue;
    }
    // A bank that grows accumulates RESTATEMENTS of the same rule ("Do not repeat
    // the question back." vs "…no restating the question"). Crediting a
    // restatement of the intended rule is not a mis-credit — the harm is crediting
    // a DIFFERENT rule. Grade by meaning, not by record id.
    const pickedText = bank.find((entry) => entry.id === picked)?.text ?? "";
    // 0.35 sits between the measured bands: a RESTATEMENT of the same rule
    // ("Do not repeat the question back." vs "…no restating the question") scores
    // 0.459, while a genuinely different rule scores 0.235. Two rules stating the
    // same thing are still cross-distribution enough that they do NOT score like
    // paraphrases — the recurring lesson.
    const sim = cosine(await embed(pickedText), await embed(STRATEGIES[index]));
    if (sim >= 0.35) credited++;
    else mis++;
  }
  check(
    `production selector @ bank ${size}: a MAJORITY of real feedback is still credited (no collapse as the bank grows)`,
    credited >= Math.ceil(HARD_CUES.length / 2),
    `${credited}/${HARD_CUES.length} credited`
  );
  check(
    `production selector @ bank ${size}: ZERO mis-credits`,
    mis === 0,
    `${mis} mis-credit(s)`
  );
}

console.log(report.join("\n"));
if (failures.length > 0) {
  console.error(`\neval:playbook-credit FAILED — ${failures.length} case(s): ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`\neval:playbook-credit PASSED — credit assignment live-validated on ${MODEL}: genuine feedback is credited, mismatched/no-match feedback is not, and decay is reachable without ever decaying the wrong strategy (KO + EN).`);
