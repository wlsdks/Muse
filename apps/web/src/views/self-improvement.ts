const AXIS_LABELS: Record<string, string> = {
  "grounding-gap": "Grounding gap",
  "source-conflict": "Conflicting notes",
  "time-parse": "Time parsing",
  "misgrounding": "Possible misgrounding",
  "wrong-tool": "Wrong tool"
};

export function weaknessAxisLabel(axis: string): string {
  return AXIS_LABELS[axis] ?? axis;
}

export function summarizeWeaknesses(entries: readonly { axis: string }[]): { total: number; axes: number } {
  const axes = new Set(entries.map((e) => e.axis)).size;
  return { total: entries.length, axes };
}
