/**
 * eval:whetstone — the ONE agent-eval gate for the Whetstone self-weakness axis
 * (monitor → detect → classify → remediate). The individual pieces are unit-
 * tested (weakness-ledger.test.ts, recall/weakness.test.ts, the CLI nudge/label
 * tests); this battery is the agent-testing.md "a capability ships with its
 * agent-level check, not just a unit test" gate — it drives the REAL selectors
 * over a fixture ledger and asserts the LOOP's invariants hold together:
 *
 *   1. GROUNDING (fabrication = 0) — every surfaced remediation names ONLY a
 *      topic/axis actually in the ledger; the hint copy quotes the real topic.
 *      A whetstone that invents a weakness the user never hit is a confident lie.
 *   2. CLASSIFICATION — a user-remediable axis (grounding-gap / source-conflict)
 *      surfaces to the USER selector, a dev-fixable axis (misgrounding /
 *      unbacked-action / wrong-tool / time-parse) to the DEV selector; neither
 *      leaks across (the two are DIFFERENT fixes).
 *   3. BKT MASTERY GATING — a mastered topic drops off both selectors; a
 *      stale-mastered topic (past the BKT-Forget retention horizon) re-surfaces.
 *   4. RUNTIME NUDGE — askTimeWeaknessNudge fires on a recurring user-remediable
 *      topic and stays silent on a mastered / non-recurring one.
 *
 * DETERMINISTIC — pure functions over fixture data, NO Ollama, no model. Always
 * runs (unlike the LLM batteries), so it's a hard CI gate in eval:agent. Exit 1
 * on any regression (a selector that invents, mis-classifies, or ignores
 * mastery); exit 0 when the loop is faithful.
 *
 *   pnpm eval:whetstone
 */

import {
  askTimeWeaknessNudge,
  isMasteredWeakness,
  remediationHint,
  renderAskTimeNudge,
  selectDevFixableWeaknesses,
  selectRemediableWeaknesses
} from "../packages/stores/dist/index.js";

const NOW = Date.parse("2026-07-14T12:00:00Z");
const DAY = 86_400_000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

// A fixture ledger spanning every axis + mastery state. Topics are distinct so a
// grounding check can prove a surfaced topic traces to a real row, never invented.
const entry = (axis, topic, count, over = {}) => ({
  axis, topic, count, firstSeen: iso(20 * DAY), lastSeen: iso(2 * DAY), ...over
});
const LEDGER = [
  entry("grounding-gap", "office vpn mtu", 4),                       // user-remediable, recurring, unmastered
  entry("source-conflict", "mom birthday", 3),                       // user-remediable (different fix)
  entry("misgrounding", "quarterly budget", 5),                      // dev-fixable
  entry("unbacked-action", "sent the email", 2),                     // dev-fixable
  entry("wrong-tool", "convert 5km", 3),                             // dev-fixable
  entry("time-parse", "next tuesday", 2),                            // dev-fixable
  entry("grounding-gap", "parking permit", 6, { pKnown: 0.99, lastResolved: iso(3 * DAY) }),   // MASTERED recently → off
  entry("misgrounding", "old topic", 4, { pKnown: 0.99, lastResolved: iso(200 * DAY) }),       // STALE-mastered → re-surfaces
  entry("grounding-gap", "one off question", 1)                      // below minCount → not surfaced
];
const LEDGER_TOPICS = new Set(LEDGER.map((e) => e.topic));

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures += 1; console.error(`  FAIL ${msg}`); } else { console.log(`  ok   ${msg}`); } };

const remediable = selectRemediableWeaknesses(LEDGER, { nowMs: NOW, maxResults: 10 });
const devFixable = selectDevFixableWeaknesses(LEDGER, { nowMs: NOW, maxResults: 10 });

// 1. GROUNDING — no invented topic; the hint copy quotes the real topic.
for (const r of [...remediable, ...devFixable]) {
  check(LEDGER_TOPICS.has(r.topic), `grounding: surfaced topic "${r.topic}" traces to a real ledger row (never invented)`);
}
for (const r of remediable) {
  check(remediationHint(r.axis, r.topic).includes(r.topic), `grounding: remediation hint for "${r.topic}" quotes the real topic, not a fabrication`);
}

// 2. CLASSIFICATION — user vs dev axes never cross.
const USER_AXES = new Set(["grounding-gap", "source-conflict"]);
const DEV_AXES = new Set(["misgrounding", "unbacked-action", "wrong-tool", "time-parse"]);
check(remediable.every((r) => USER_AXES.has(r.axis)), "classification: user selector holds ONLY user-remediable axes");
check(devFixable.every((r) => DEV_AXES.has(r.axis)), "classification: dev selector holds ONLY dev-fixable axes");
check(remediable.some((r) => r.topic === "office vpn mtu") && remediable.some((r) => r.topic === "mom birthday"),
  "classification: both a grounding-gap AND a source-conflict reach the user selector");
check(devFixable.some((r) => r.axis === "misgrounding"), "classification: a misgrounding (GROUNDED≠TRUE) reaches the dev selector");

// 3. BKT MASTERY GATING — mastered drops, stale-mastered re-surfaces.
check(!remediable.some((r) => r.topic === "parking permit") && !devFixable.some((r) => r.topic === "parking permit"),
  "BKT: a recently-mastered topic (pKnown≥0.95, fresh) is off BOTH selectors");
check(devFixable.some((r) => r.topic === "old topic"),
  "BKT-Forget: a stale-mastered topic (past the retention horizon) re-surfaces");
const masteredEntry = LEDGER.find((e) => e.topic === "parking permit");
const staleEntry = LEDGER.find((e) => e.topic === "old topic");
check(isMasteredWeakness(masteredEntry, { nowMs: NOW }) === true, "BKT: isMasteredWeakness true for a fresh mastered entry");
check(isMasteredWeakness(staleEntry, { nowMs: NOW }) === false, "BKT-Forget: isMasteredWeakness false past the retention horizon");

// 4. RUNTIME NUDGE — fires on a recurring user-remediable topic, silent otherwise.
const nudge = askTimeWeaknessNudge(LEDGER, "office vpn mtu", { nowMs: NOW });
check(nudge !== undefined && nudge.topic === "office vpn mtu" && nudge.hint.includes("office vpn mtu"),
  "runtime nudge: a recurring user-remediable topic fires a grounded point-of-use nudge");
// The USER-VISIBLE sentence (KO + EN) must also quote the real topic — the
// fabrication=0 floor holds for the rendered copy, not just the raw hint.
check(nudge !== undefined && renderAskTimeNudge(nudge, false).includes("office vpn mtu") && renderAskTimeNudge(nudge, true).includes("office vpn mtu"),
  "runtime nudge: the rendered EN + KO sentence quotes the real topic (grounded copy, no fabrication)");
check(askTimeWeaknessNudge(LEDGER, "parking permit", { nowMs: NOW }) === undefined,
  "runtime nudge: a mastered topic stays silent (no nag after the user fixed it)");
check(askTimeWeaknessNudge(LEDGER, "one off question", { nowMs: NOW }) === undefined,
  "runtime nudge: a non-recurring (count=1) topic stays silent");
check(askTimeWeaknessNudge(LEDGER, "quarterly budget", { nowMs: NOW }) === undefined,
  "runtime nudge: a DEV-fixable axis is not surfaced to the user as a note-it nudge");

console.log(`\neval:whetstone — ${failures === 0 ? "PASSED" : `FAILED (${failures})`}`);
if (failures > 0) process.exit(1);
