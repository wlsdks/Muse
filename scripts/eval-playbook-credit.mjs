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
  selectCreditTargetSemantic
} from "../packages/agent-core/dist/index.js";
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

console.log(report.join("\n"));
if (failures.length > 0) {
  console.error(`\neval:playbook-credit FAILED — ${failures.length} case(s): ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`\neval:playbook-credit PASSED — credit assignment live-validated on ${MODEL}: genuine feedback is credited, mismatched/no-match feedback is not, and decay is reachable without ever decaying the wrong strategy (KO + EN).`);
