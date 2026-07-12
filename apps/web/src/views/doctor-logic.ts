import type { DoctorCheck } from "../api/types.js";

/** Map a doctor severity onto the Badge tone scale. */
export function severityTone(severity: DoctorCheck["severity"]): "ok" | "warn" | "err" {
  if (severity === "ok") {
    return "ok";
  }
  return severity === "warn" ? "warn" : "err";
}

/** The card's headline state: the worst severity across all checks. */
export function worstSeverity(checks: readonly DoctorCheck[]): DoctorCheck["severity"] {
  if (checks.some((check) => check.severity === "error")) {
    return "error";
  }
  return checks.some((check) => check.severity === "warn") ? "warn" : "ok";
}

/** Issues (non-ok) first, errors before warnings, stable otherwise. */
export function sortChecks(checks: readonly DoctorCheck[]): readonly DoctorCheck[] {
  const rank = (severity: DoctorCheck["severity"]): number =>
    severity === "error" ? 0 : severity === "warn" ? 1 : 2;
  return [...checks].sort((a, b) => rank(a.severity) - rank(b.severity));
}
