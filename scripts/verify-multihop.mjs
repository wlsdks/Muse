/**
 * eval:multihop — MEASURE-FIRST: does single-hop retrieval already serve
 * two-hop questions at personal scale?
 *
 * Each case asks a question whose answer note is reachable only THROUGH an
 * intermediate entity (hop1: "who is my manager" → Dana; hop2: "who does Dana
 * report to" → Sarah). The query shares NO token with the hop2 answer note, so
 * a lexical match can't carry it — only semantic ranking (or true multi-hop
 * decomposition) can. We run the PRODUCTION single-hop ranker
 * (rankKnowledgeChunks, hybrid+diversify) and measure whether the hop2 answer
 * note lands in the top-K anyway.
 *
 * Interpretation (this is a measurement, not a pass/fail gate):
 *   high hit@K → at personal corpus size the answer note is retrieved without
 *     decomposition; multi-hop decomposition is LOW ROI (don't build it).
 *   low hit@K  → single-hop misses the bridged note; multi-hop decomposition
 *     has ROI — worth a real slice.
 *
 * LOCAL OLLAMA ONLY; skips (exit 0) when unreachable.
 */
import { rankKnowledgeChunks } from "../packages/agent-core/dist/index.js";
import { createOllamaEmbedder } from "../packages/autoconfigure/dist/index.js";
import { DEFAULT_EMBED_MODEL } from "../apps/cli/dist/embed-model-default.js";
import { scoreRetrievalRecall } from "../apps/cli/dist/embedder-ab.js";
import { diversifyAskChunks, secondHopAugmentChunks } from "../packages/recall/dist/index.js";
import { cosine } from "../apps/cli/dist/commands-notes-rag.js";

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
try {
  const r = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!r.ok) throw new Error(String(r.status));
} catch {
  console.log(`eval:multihop skipped — Ollama unreachable at ${OLLAMA_BASE}.`);
  process.exit(0);
}

const notes = [
  // chain 1: manager → their boss
  { source: "mgr.md", text: "내 매니저는 다나 김이다. 플랫폼 팀을 이끈다." },
  { source: "org.md", text: "다나 김은 사라 이 부사장에게 보고한다." },
  // chain 2: usual cafe → its wifi
  { source: "cafe.md", text: "단골 카페는 성수동 블루보틀이다. 일주일에 세 번 간다." },
  { source: "cafewifi.md", text: "성수동 블루보틀 와이파이 비밀번호는 bluebottle2026 이다." },
  // chain 3: mom's birthday → the restaurant booked that day
  { source: "mombday.md", text: "엄마 생신은 5월 3일이다." },
  { source: "booking.md", text: "5월 3일 저녁 7시 정식당 예약 완료, 전화 02-777-8888." },
  // chain 4 (EN): project lead → the repo they own
  { source: "lead.md", text: "The Apollo project lead is Mina Park." },
  { source: "repo.md", text: "Mina Park owns the apollo-api repository on the internal GitLab." },
  // chain 5 (EN): my dentist → its address
  { source: "dentist.md", text: "My dentist is Dr. Cho at Smile Clinic." },
  { source: "clinic.md", text: "Smile Clinic is on the 3rd floor of the Gangnam Finance Tower." },
  // distractors (unrelated)
  { source: "d1.md", text: "주말마다 등산을 간다. 다음 목표는 설악산." },
  { source: "d2.md", text: "The team standup is every weekday at 9:30am on Zoom." },
  { source: "d3.md", text: "차 엔진오일은 작년 11월에 교체했다." },
  { source: "d4.md", text: "Monthly grocery budget is 600,000 won." }
];

const cases = [
  { query: "내 매니저는 누구에게 보고해?", expectedSource: "org.md" },
  { query: "내가 자주 가는 카페 와이파이 비번 뭐야?", expectedSource: "cafewifi.md" },
  { query: "엄마 생신날 예약한 식당 전화번호 알려줘", expectedSource: "booking.md" },
  { query: "who owns the repo for the project Mina leads?", expectedSource: "repo.md" },
  { query: "where is my dentist's clinic located?", expectedSource: "clinic.md" }
];

const embed = createOllamaEmbedder(DEFAULT_EMBED_MODEL);
try {
  await embed("probe");
} catch (cause) {
  console.log(`eval:multihop skipped — embedder unavailable (${cause instanceof Error ? cause.message : String(cause)}).`);
  process.exit(0);
}

const topK = 4;
const rank = (query) => rankKnowledgeChunks(query, notes, { diversify: true, embed, hybrid: true, topK });
const r = await scoreRetrievalRecall(cases, rank);

console.log(`eval:multihop — single-hop ranker on ${cases.length} two-hop queries (topK ${topK}, ${notes.length}-note corpus)`);
console.log(`  hit@1 = ${r.hit1}/${r.total}   hit@${topK} = ${r.hitK}/${r.total}`);
if (r.misses && r.misses.length > 0) console.log(`  missed: ${r.misses.join(" · ")}`);
const pct = (r.hitK / r.total) * 100;

// AUGMENT arm: replicate the `muse ask` INLINE recall path on the SAME corpus —
// per-chunk cosine over the in-memory IndexChunk[] → diversifyAskChunks (hybrid
// MMR) → secondHopAugmentChunks (the slice-1b′ second-hop AUGMENT). This proves
// the helper's lift on the inline path the production surface actually runs,
// not the rankKnowledgeChunks engine the single-hop arm above measures.
const toIndexChunks = async () => {
  const out = [];
  for (const n of notes) {
    out.push({ file: n.source, chunkIndex: 0, text: n.text, embedding: await embed(n.text) });
  }
  return out;
};
const indexChunks = await toIndexChunks();
const augmentRank = async (query) => {
  const queryVec = await embed(query);
  const allScored = indexChunks.map((chunk) => ({ chunk, file: chunk.file, score: cosine(queryVec, chunk.embedding) }));
  let scored = diversifyAskChunks(allScored, topK, undefined, query);
  const additions = secondHopAugmentChunks(queryVec, cosine, allScored, scored.slice(0, 2), scored, 2);
  for (const add of additions) if (!scored.includes(add)) scored = [...scored, add];
  return scored.map((s) => ({ source: s.file, text: s.chunk.text, cosine: s.score, score: s.score }));
};
const ra = await scoreRetrievalRecall(cases, augmentRank);

console.log(`\neval:multihop (AUGMENT arm) — ask INLINE path + second-hop on the same ${cases.length} queries`);
console.log(`  hit@1 = ${ra.hit1}/${ra.total}   hit@${topK} = ${ra.hitK}/${ra.total}`);
if (ra.misses && ra.misses.length > 0) console.log(`  missed: ${ra.misses.join(" · ")}`);
const pctA = (ra.hitK / ra.total) * 100;

console.log(
  pctA > pct
    ? `\nVERDICT: second-hop AUGMENT lifts the inline path (hit@${topK} ${pct.toFixed(0)}% → ${pctA.toFixed(0)}%) — positive ROI, AUGMENT-only (single-hop order unchanged).`
    : pct >= 80
      ? `\nVERDICT: single-hop already serves two-hop at personal scale (hit@${topK} ${pct.toFixed(0)}%) → multi-hop decomposition is LOW ROI.`
      : `\nVERDICT: single-hop misses bridged notes (hit@${topK} ${pct.toFixed(0)}%); AUGMENT arm hit@${topK} ${pctA.toFixed(0)}%.`
);
