/**
 * AC-power gate for the background self-learning brake.
 *
 * A heavy unattended LLM merge must not drain the user's battery — per A2/B1
 * "AC-preferred; battery ⇒ memory-only". This reads the power source from
 * `pmset -g batt` ("Now drawing from 'AC Power' | 'Battery Power'"). On a
 * desktop (no battery) macOS still reports AC. FAIL-CLOSED for the LLM phase:
 * any parse/exec error or a non-macOS host yields `undefined`, which the gate
 * treats as "not OK to run" — we never run the LLM merge without positive
 * evidence the machine is on wall power. (PART A2 / B1 brake-first.)
 */
import { execFileSync } from "node:child_process";

/**
 * Parse the power source from `pmset -g batt` output. Returns true on AC,
 * false on battery, undefined when the line is absent/unparseable
 * (fail-closed). Pure → testable.
 */
export function parseOnAcPower(pmsetBattOutput: string): boolean | undefined {
  if (/drawing from '?AC Power'?/iu.test(pmsetBattOutput)) {
    return true;
  }
  if (/drawing from '?Battery Power'?/iu.test(pmsetBattOutput)) {
    return false;
  }
  return undefined;
}

/**
 * Whether the machine is on AC power, or undefined when it can't be
 * determined (non-macOS, pmset missing, parse failure) — fail-closed. The
 * `runPmset` seam lets tests inject output without shelling out.
 */
export function isOnAcPower(runPmset: () => string = defaultPmset): boolean | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }
  try {
    return parseOnAcPower(runPmset());
  } catch {
    return undefined;
  }
}

function defaultPmset(): string {
  return execFileSync("pmset", ["-g", "batt"], { encoding: "utf8", timeout: 5000 });
}

/**
 * Brake predicate: the LLM merge may run only on confirmed AC power. Battery
 * (false) ⇒ memory-only ⇒ skip the LLM; unknown (undefined) ⇒ fail-closed
 * skip. So the heavy background job never drains the battery.
 */
export function isPowerOkForLlm(onAc: boolean | undefined): boolean {
  return onAc === true;
}
