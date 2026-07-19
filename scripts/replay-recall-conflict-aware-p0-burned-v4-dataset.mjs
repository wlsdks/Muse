import { createHash } from "node:crypto";

import {
  BURNED_V2_DATASET_SHA256,
  BURNED_V2_NORMALIZED_HASH_COUNT,
  BURNED_V2_NORMALIZED_HASHES_BASE64
} from "./replay-recall-conflict-aware-p0-burned-v4-burned-v2-fingerprint.mjs";
import {
  BURNED_V3_DATASET_SHA256,
  BURNED_V3_NORMALIZED_HASH_COUNT,
  BURNED_V3_NORMALIZED_HASHES_BASE64
} from "./replay-recall-conflict-aware-p0-burned-v4-burned-v3-fingerprint.mjs";
import {
  RECALL_CONFLICT_DEV_MATRIX_SHA256,
  RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASH_COUNT,
  RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASHES_BASE64
} from "./replay-recall-conflict-aware-p0-burned-v4-dev-matrix-fingerprint.mjs";

export const BURNED_V4_ORIGINAL_DATASET_SHA256 = "28f5bad8e4245f1932be2beabcb0a04b9fb2ca411c42682b237ee9831f45dcf7";
export const BURNED_V4_REPLAY_DATASET_VERSION = "muse-recall-burned-v4-diagnostic-replay.v1";
export const BURNED_V4_REPLAY_SCHEMA_VERSION = "muse-recall-eval-dataset.v4";
export const SOURCE_FREEZE_COMMIT = "4a1f046bce0cfb7762072137c83f438e34540f38";
const EXCLUSION_FINGERPRINTS = Object.freeze({
  burnedV2DatasetSha256: BURNED_V2_DATASET_SHA256,
  burnedV3DatasetSha256: BURNED_V3_DATASET_SHA256,
  developmentMatrixSha256: RECALL_CONFLICT_DEV_MATRIX_SHA256,
  frozenV1DatasetSha256: "1276decb403f5f2583ee0cedb8ffb3860d54126fd5dccb7a87e31a9531b2fe89"
});

const KO_CORRECTIONS = [
  ["byeolmaru-aviary-feed", "별마루 조류원 먹이 배합", "씨앗 7 대 과일 3", "씨앗 5 대 과일 5", "급수통 세척 6일마다"],
  ["byeolmaru-canoe-rope", "별마루 카누 계류줄 길이", "4.6미터", "3.8미터", "노 보관대 폭 72센티미터"],
  ["byeolmaru-clock-wind", "별마루 시계탑 태엽 점검", "11일마다", "7일마다", "종소리 시험 09시 40분"],
  ["byeolmaru-fern-fog", "별마루 양치식물 안개 분사", "매일 06시 35분", "매일 08시", "배수판 확인 3일마다"],
  ["ondam-lab-centrifuge", "온담 연구실 원심분리 균형 오차", "0.6그램 이하", "1.2그램 이하", "튜브 표찰 길이 28밀리미터"],
  ["ondam-planetarium-door", "온담 천문관 돔 출입 마감", "상영 23분 전", "상영 15분 전", "좌석 조명 점검 18분 전"],
  ["ondam-reservoir-sample", "온담 저수지 시료 채취 깊이", "수면 아래 1.4미터", "수면 아래 0.8미터", "병 운반 온도 섭씨 6도"],
  ["ondam-loom-tension", "온담 직조실 날실 장력", "34뉴턴", "27뉴턴", "북실 교체 13미터마다"],
  ["saebom-amphitheater-gate", "새봄 야외극장 후문 개방", "행사 52분 전", "행사 35분 전", "안내판 설치 80분 전"],
  ["saebom-cider-chill", "새봄 사과주스 급속 냉각", "섭씨 6도까지", "섭씨 9도까지", "병 세척수 섭씨 48도"],
  ["saebom-dive-tank", "새봄 잠수 장비 공기통 잔압", "45바에서 교체", "30바에서 교체", "호흡기 세척 16분"],
  ["saebom-maple-tap", "새봄 단풍나무 수액 통 비움", "12시간마다", "18시간마다", "호스 헹굼 4일마다"],
  ["hanulbit-audio-buffer", "한울빛 음향실 녹음 버퍼", "768샘플", "512샘플", "헤드폰 점검 21일마다"],
  ["hanulbit-falcon-weight", "한울빛 매 구조대 비행 허용 무게", "1.15킬로그램 이하", "1.3킬로그램 이하", "발목띠 확인 5일마다"],
  ["hanulbit-ice-core", "한울빛 빙하 시료 절단 폭", "18밀리미터", "25밀리미터", "칼날 냉각 14분"],
  ["hanulbit-puppet-string", "한울빛 인형극 조종줄 여유", "6센티미터", "10센티미터", "무대막 확인 17시 10분"],
  ["raon-gong-damping", "라온 국악실 징 울림 감쇠", "14초", "20초", "채 보관 습도 46퍼센트"],
  ["raon-oyster-sort", "라온 굴 양식장 선별 간격", "9일마다", "14일마다", "바구니 세척 5시간마다"],
  ["raon-paper-press", "라온 제지 공방 압착 시간", "37분", "25분", "건조대 간격 11센티미터"],
  ["raon-tram-bell", "라온 관광 전차 종 시험", "첫 운행 41분 전", "첫 운행 25분 전", "표지판 점검 06시 50분"],
  ["yeoul-compost-turn", "여울 공동밭 퇴비 뒤집기", "6일마다", "10일마다", "수분 측정 2일마다"],
  ["yeoul-film-bath", "여울 사진실 현상액 교체", "필름 28롤마다", "필름 40롤마다", "집게 소독 12롤마다"],
  ["yeoul-glider-winch", "여울 활공장 윈치 정지 풍속", "시속 31킬로미터", "시속 38킬로미터", "케이블 검사 19회마다"],
  ["yeoul-mosaic-grout", "여울 모자이크실 줄눈 양생", "44시간", "30시간", "타일 세척 7시간 뒤"]
];

const EN_CORRECTIONS = [
  ["acorn-ferry-ramp", "Acorn terminal ferry ramp inspection", "every 13 crossings", "every 20 crossings", "hinge grease after 55 crossings"],
  ["acorn-herb-dryer", "Acorn kitchen herb dryer airflow", "2.4 meters per second", "1.8 meters per second", "tray rotation every 36 minutes"],
  ["acorn-lantern-charge", "Acorn trail lantern recharge trigger", "at 38 percent", "at 22 percent", "lens wipe every 12 outings"],
  ["acorn-print-bleed", "Acorn press poster bleed", "4.5 millimeters", "3 millimeters", "crop mark offset 7 millimeters"],
  ["bracken-alpaca-shear", "Bracken farm alpaca shearing interval", "every 146 days", "every 180 days", "halter check every 24 days"],
  ["bracken-bellows-rest", "Bracken forge bellows rest", "9 minutes", "5 minutes", "coal sieve after 18 batches"],
  ["bracken-coral-flow", "Bracken lab coral channel flow", "14 liters per minute", "18 liters per minute", "sensor rinse every 33 hours"],
  ["bracken-theater-fade", "Bracken theater aisle fade time", "6.5 seconds", "4 seconds", "curtain cue 19 seconds later"],
  ["cinder-brew-kettle", "Cinder workshop brew kettle hold", "72 minutes", "60 minutes", "valve rinse for 11 minutes"],
  ["cinder-courier-scan", "Cinder depot courier rescan window", "within 26 minutes", "within 45 minutes", "cart seal check every 8 parcels"],
  ["cinder-harp-pedal", "Cinder hall harp pedal clearance", "8 millimeters", "5 millimeters", "string inspection every 17 sessions"],
  ["cinder-wetland-board", "Cinder reserve wetland boardwalk closure", "water at 19 centimeters", "water at 25 centimeters", "marker posts checked weekly"],
  ["drift-archive-glove", "Drift archive handling glove replacement", "every 4 shifts", "every 7 shifts", "desk mat cleaned every 2 shifts"],
  ["drift-cacao-roast", "Drift roastery cacao cooling span", "21 minutes", "14 minutes", "sample weigh at 180 grams"],
  ["drift-origami-light", "Drift gallery origami display light", "88 lux", "110 lux", "case fan at 900 rpm"],
  ["drift-ski-wax", "Drift lodge ski wax iron setting", "118 Celsius", "132 Celsius", "scraper sharpened every 9 pairs"],
  ["ember-canopy-sensor", "Ember forest canopy sensor upload", "every 37 minutes", "every 60 minutes", "battery audit every 15 days"],
  ["ember-fountain-pump", "Ember plaza fountain pump pause", "12 minutes each hour", "8 minutes each hour", "nozzle brush every 6 days"],
  ["ember-glass-anneal", "Ember studio glass annealing descent", "9 degrees per hour", "14 degrees per hour", "door seal checked every 5 firings"],
  ["ember-viola-case", "Ember orchestra viola case humidity", "47 percent", "40 percent", "bow hair checked every 22 days"],
  ["willow-buoy-signal", "Willow marina buoy signal interval", "every 7 seconds", "every 11 seconds", "anchor chain checked monthly"],
  ["willow-linen-rinse", "Willow laundry linen final rinse", "three cycles", "two cycles", "folding table sanitized at noon"],
  ["willow-meteor-camera", "Willow observatory meteor camera exposure", "3.2 seconds", "5 seconds", "tripod level checked at dusk"],
  ["willow-truffle-vault", "Willow pantry truffle vault humidity", "68 percent", "74 percent", "crate labels checked every Friday"]
];

const KO_ORDINARY = [
  ["ko-v4-ordinary-baduk-cabinet", "바둑 교실 돌 보관함", "서랍 K-8", "바둑 교실의 돌은 현재 서랍 K-8에 보관합니다."],
  ["ko-v4-ordinary-dahlia-tag", "달리아 온실 표찰 색", "청록색", "달리아 온실에서 현재 사용하는 표찰은 청록색입니다."],
  ["ko-v4-ordinary-lighthouse-key", "등대 기록실 열쇠 번호", "R-41", "등대 기록실의 현재 열쇠 번호는 R-41입니다."],
  ["ko-v4-ordinary-xylophone-cart", "실로폰 운반 카트 위치", "서쪽 무대문", "실로폰 운반 카트는 현재 서쪽 무대문에 있습니다."]
];
const EN_ORDINARY = [
  ["en-v4-ordinary-bonsai-apron", "bonsai workshop apron hook", "hook P-12", "The bonsai workshop apron currently hangs on hook P-12."],
  ["en-v4-ordinary-dune-flag", "dune survey flag color", "silver", "The current dune survey flag color is silver."],
  ["en-v4-ordinary-kayak-ledger", "kayak rental ledger shelf", "shelf 6C", "The kayak rental ledger is currently stored on shelf 6C."],
  ["en-v4-ordinary-marimba-case", "marimba mallet case label", "triangle 27", "The current marimba mallet case label is triangle 27."]
];
const KO_ABSENT = [
  ["ko-v4-absent-fox-brooch", "내 여우 모양 브로치에 붙인 애칭은 무엇인가요?"],
  ["ko-v4-absent-indigo-bowl", "내 쪽빛 그릇 바닥에 적힌 비밀 단어는 무엇인가요?"],
  ["ko-v4-absent-lotus-lamp", "내 연꽃 전등을 만든 장인의 이름은 무엇인가요?"],
  ["ko-v4-absent-snowy-drum", "내 눈꽃 북의 개인 식별 문자는 무엇인가요?"]
];
const EN_ABSENT = [
  ["en-v4-absent-badger-pin", "What private nickname did I give my badger lapel pin?"],
  ["en-v4-absent-jade-whistle", "Which maker crafted my jade-colored whistle?"],
  ["en-v4-absent-moth-journal", "What hidden word is stamped inside my moth journal?"],
  ["en-v4-absent-sunrise-tongs", "What personal code is engraved on my sunrise pastry tongs?"]
];

function correctionRows(locale, rows) {
  return rows.map(([slug, label, current, stale, distractor], index) => {
    const prefix = `heldout-v4/${locale}/${slug}`;
    const currentSource = `${prefix}-current`; const staleSource = `${prefix}-stale`; const distractorSource = `${prefix}-distractor`;
    const query = locale === "ko" ? `${label} 기록에서 지금 적용할 기준은 무엇인가요?` : `Which standard currently applies to ${label}?`;
    const currentText = locale === "ko" ? `${label} 운영 메모. 현재 기준은 ${current}로 확정했습니다. 이 항목을 최신 지침으로 사용합니다.` : `${label} operating note. The active standard is ${current}. This entry is the latest instruction.`;
    const staleText = locale === "ko" ? `${label} 과거 메모. 이전에 ${stale}을 적용했습니다. 지금은 아니며 해당 기준은 폐기했습니다.` : `${label} historical note. We used to apply ${stale}. It is no longer active and has been retired.`;
    const distractorText = locale === "ko" ? `${label} 보조 메모. ${distractor}을 별도로 기록했습니다. 이것은 적용 기준에 대한 답이 아닙니다.` : `${label} supplementary note. ${distractor} is recorded separately. It does not answer which standard applies.`;
    return { case: { caseId: `heldout-v4-correction-${locale}-${String(index + 1).padStart(2, "0")}`, category: "correction-pair", currentSource, distractorSource, expectedSource: currentSource, locale, query, staleSource, topicId: `${locale}-v4-${slug}` }, corpus: [{ source: currentSource, text: currentText }, { source: staleSource, text: staleText }, { source: distractorSource, text: distractorText }] };
  });
}
function ordinaryRows(locale, rows) { return rows.map(([topicId, label, value, text], index) => { const source = `heldout-v4/${locale}/${topicId}-current`; return { case: { caseId: `heldout-v4-ordinary-${locale}-${String(index + 1).padStart(2, "0")}`, category: "ordinary-positive", currentSource: source, distractorSource: null, expectedSource: source, locale, query: locale === "ko" ? `${label}의 현재 기록을 확인해 주세요.` : `Please give me the recorded current ${label}.`, staleSource: null, topicId }, corpus: [{ source, text: `${text} Verification token: ${value}.` }] }; }); }
function absentRows(locale, rows) { return rows.map(([topicId, query], index) => ({ case: { caseId: `heldout-v4-absent-${locale}-${String(index + 1).padStart(2, "0")}`, category: "absent", currentSource: null, distractorSource: null, expectedSource: null, locale, query, staleSource: null, topicId }, corpus: [] })); }
function freezeDataset(value) { for (const item of value.cases) Object.freeze(item); for (const item of value.corpus) Object.freeze(item); Object.freeze(value.cases); Object.freeze(value.corpus); return Object.freeze(value); }
const rows = [...correctionRows("ko", KO_CORRECTIONS), ...correctionRows("en", EN_CORRECTIONS), ...ordinaryRows("ko", KO_ORDINARY), ...ordinaryRows("en", EN_ORDINARY), ...absentRows("ko", KO_ABSENT), ...absentRows("en", EN_ABSENT)];
export const BURNED_V4_REPLAY_DATASET = freezeDataset({
  burnedV4OriginalDatasetSha256: BURNED_V4_ORIGINAL_DATASET_SHA256,
  cases: rows.map((item) => item.case),
  corpus: rows.flatMap((item) => item.corpus),
  dataOrigin: "synthetic burned v4 diagnostic replay",
  datasetVersion: BURNED_V4_REPLAY_DATASET_VERSION,
  exclusionFingerprints: EXCLUSION_FINGERPRINTS,
  heldOut: false,
  organicEvidence: false,
  qualificationStatus: "NOT_QUALIFIED",
  schemaVersion: BURNED_V4_REPLAY_SCHEMA_VERSION,
  sourceFreezeCommit: SOURCE_FREEZE_COMMIT
});

export function normalizeDisjointText(value) { return value.normalize("NFKC").toLocaleLowerCase("und").replaceAll(/\s+/gu, " ").trim(); }
function normalizedHash(value) { return createHash("sha256").update(normalizeDisjointText(value)).digest("hex"); }
function exactKeys(value, expected, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`); if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields mismatch`); }
function collectStrings(value, out = []) { if (typeof value === "string") out.push(value); else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out)); else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out)); return out; }
function decodeHashes(base64, count, label) { const bytes = Buffer.from(base64, "base64"); if (bytes.length !== count * 32) throw new Error(`${label} fingerprint corrupt`); const out = new Set(); for (let offset = 0; offset < bytes.length; offset += 32) out.add(bytes.subarray(offset, offset + 32).toString("hex")); return out; }

export function validateBurnedV4ReplayDataset(dataset, frozenV1, detectStaleMarker) {
  exactKeys(dataset, ["burnedV4OriginalDatasetSha256", "cases", "corpus", "dataOrigin", "datasetVersion", "exclusionFingerprints", "heldOut", "organicEvidence", "qualificationStatus", "schemaVersion", "sourceFreezeCommit"], "dataset");
  if (dataset.datasetVersion !== BURNED_V4_REPLAY_DATASET_VERSION || dataset.schemaVersion !== BURNED_V4_REPLAY_SCHEMA_VERSION || dataset.dataOrigin !== "synthetic burned v4 diagnostic replay" || dataset.heldOut !== false || dataset.organicEvidence !== false || dataset.qualificationStatus !== "NOT_QUALIFIED" || dataset.sourceFreezeCommit !== SOURCE_FREEZE_COMMIT || dataset.burnedV4OriginalDatasetSha256 !== BURNED_V4_ORIGINAL_DATASET_SHA256 || dataset.cases.length !== 64 || dataset.corpus.length !== 152) throw new Error("dataset metadata/version/count mismatch");
  if (JSON.stringify(dataset.exclusionFingerprints) !== JSON.stringify(EXCLUSION_FINGERPRINTS)) throw new Error("dataset exclusion fingerprint mismatch");
  const v1Hashes = new Set(collectStrings(frozenV1).map(normalizedHash));
  const burnedV2Hashes = decodeHashes(BURNED_V2_NORMALIZED_HASHES_BASE64, BURNED_V2_NORMALIZED_HASH_COUNT, "burned v2");
  const burnedV3Hashes = decodeHashes(BURNED_V3_NORMALIZED_HASHES_BASE64, BURNED_V3_NORMALIZED_HASH_COUNT, "burned v3");
  const devMatrixHashes = decodeHashes(RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASHES_BASE64, RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASH_COUNT, "development matrix");
  const caseIds = new Set(); const topicIds = new Set(); const queries = new Set(); const sources = new Map(); const textHashes = new Set();
  const rejectOverlap = (value, label) => { const hash = normalizedHash(value); if (v1Hashes.has(hash)) throw new Error(`v1 overlap in ${label}`); if (burnedV2Hashes.has(hash)) throw new Error(`burned v2 overlap in ${label}`); if (burnedV3Hashes.has(hash)) throw new Error(`burned v3 overlap in ${label}`); if (devMatrixHashes.has(hash)) throw new Error(`development matrix overlap in ${label}`); return hash; };
  for (const item of dataset.corpus) { exactKeys(item, ["source", "text"], "corpus item"); if (!item.source.startsWith("heldout-v4/") || sources.has(item.source) || item.text.length < 20) throw new Error("corpus source/text invariant"); const hash = rejectOverlap(item.text, "corpus text"); if (textHashes.has(hash)) throw new Error("v4 corpus text collision"); textHashes.add(hash); sources.set(item.source, item.text); }
  for (const item of dataset.cases) {
    exactKeys(item, ["caseId", "category", "currentSource", "distractorSource", "expectedSource", "locale", "query", "staleSource", "topicId"], `case ${item.caseId}`);
    if (!item.caseId.startsWith("heldout-v4-") || caseIds.has(item.caseId) || topicIds.has(item.topicId) || queries.has(normalizeDisjointText(item.query)) || !["ko", "en"].includes(item.locale) || !["correction-pair", "ordinary-positive", "absent"].includes(item.category)) throw new Error("case/topicId/query uniqueness invariant");
    caseIds.add(item.caseId); topicIds.add(item.topicId); queries.add(normalizeDisjointText(item.query)); rejectOverlap(item.caseId, "case id"); rejectOverlap(item.query, "query");
    if (item.category === "correction-pair") { if (item.expectedSource !== item.currentSource || new Set([item.currentSource, item.staleSource, item.distractorSource]).size !== 3 || !sources.has(item.currentSource) || !sources.has(item.staleSource) || !sources.has(item.distractorSource)) throw new Error("correction source invariant"); if (!detectStaleMarker(sources.get(item.staleSource)) || detectStaleMarker(sources.get(item.currentSource)) || detectStaleMarker(sources.get(item.distractorSource))) throw new Error("stale marker invariant"); }
    else if (item.category === "ordinary-positive") { if (item.expectedSource !== item.currentSource || !sources.has(item.currentSource) || item.staleSource !== null || item.distractorSource !== null) throw new Error("ordinary source invariant"); }
    else if ([item.expectedSource, item.currentSource, item.staleSource, item.distractorSource].some((value) => value !== null)) throw new Error("absent source invariant");
  }
  const expected = { "correction-pair": { ko: 24, en: 24 }, "ordinary-positive": { ko: 4, en: 4 }, absent: { ko: 4, en: 4 } }; for (const [category, locales] of Object.entries(expected)) for (const [locale, count] of Object.entries(locales)) if (dataset.cases.filter((item) => item.category === category && item.locale === locale).length !== count) throw new Error(`${category}/${locale} balance mismatch`);
  const referenced = new Set(dataset.cases.flatMap((item) => [item.currentSource, item.staleSource, item.distractorSource].filter(Boolean))); if (referenced.size !== dataset.corpus.length || [...sources.keys()].some((source) => !referenced.has(source)) || !Object.isFrozen(dataset)) throw new Error("closed corpus/immutability invariant"); return dataset;
}
