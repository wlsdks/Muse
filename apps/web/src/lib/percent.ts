export function formatProbabilityPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const clamped = Math.min(1, Math.max(0, value));
  let pct = Math.round(clamped * 100);
  if (pct === 100 && clamped < 1) pct = 99;
  if (pct === 0 && clamped > 0) pct = 1;
  return `${pct}%`;
}
