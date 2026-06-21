export function summarizeSkills(entries: readonly { avoided: boolean }[]): {
  total: number;
  active: number;
  avoided: number;
} {
  let avoided = 0;
  for (const entry of entries) {
    if (entry.avoided) {
      avoided += 1;
    }
  }
  return { total: entries.length, active: entries.length - avoided, avoided };
}
