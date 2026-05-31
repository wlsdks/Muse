/**
 * "What you've been focused on" — a GROUNDED, deterministic notice for
 * `muse today` (B2 S6/S7 felt moment). The ONLY signal is note *mtime* (writes
 * the user actually made), never opens/reads — so the line is honest: "you've
 * been editing your <family> notes", not "you looked at". Pure data→text; a
 * sparse/quiet corpus yields NO line (the honest-silence half), so it never
 * fabricates a "you've been busy" that didn't happen.
 */

export interface NoteMtime {
  /** Note path relative to the notes dir, e.g. "projects/wedding/venue.md". */
  readonly relPath: string;
  /** Last-write epoch ms. */
  readonly mtimeMs: number;
}

export interface NoteFocus {
  /** The note family (top-level folder, or "your notes" for root-level files). */
  readonly family: string;
  /** How many of that family's notes were edited inside the window. */
  readonly count: number;
}

const DAY_MS = 86_400_000;
const ROOT_FAMILY = "your notes";

/** The family a note belongs to — its top-level folder, or ROOT_FAMILY at the root. */
function familyOf(relPath: string): string {
  const norm = relPath.replace(/^[./]+/u, "");
  const slash = norm.indexOf("/");
  return slash > 0 ? norm.slice(0, slash) : ROOT_FAMILY;
}

/**
 * The single note family the user has been editing most inside the window —
 * the focus signal. Returns undefined unless some family has at least
 * `minEdits` notes edited in the last `windowDays` (so a quiet week stays
 * silent). Ties break toward the family with the most-recent edit.
 */
export function selectNoteFocus(
  files: readonly NoteMtime[],
  nowMs: number,
  options: { readonly windowDays?: number; readonly minEdits?: number } = {}
): NoteFocus | undefined {
  const windowMs = Math.max(1, options.windowDays ?? 7) * DAY_MS;
  const minEdits = Math.max(2, options.minEdits ?? 3);
  const byFamily = new Map<string, { count: number; latest: number }>();
  for (const f of files) {
    if (!Number.isFinite(f.mtimeMs) || nowMs - f.mtimeMs > windowMs || f.mtimeMs > nowMs) {
      continue;
    }
    const fam = familyOf(f.relPath);
    const cur = byFamily.get(fam) ?? { count: 0, latest: 0 };
    byFamily.set(fam, { count: cur.count + 1, latest: Math.max(cur.latest, f.mtimeMs) });
  }
  let best: NoteFocus | undefined;
  let bestLatest = 0;
  for (const [family, { count, latest }] of byFamily) {
    if (count < minEdits) {
      continue;
    }
    if (!best || count > best.count || (count === best.count && latest > bestLatest)) {
      best = { count, family };
      bestLatest = latest;
    }
  }
  return best;
}

/** Render the focus notice as a `muse today` section, or "" when there's nothing to surface. */
export function formatNoteFocusSection(focus: NoteFocus | undefined): string {
  if (!focus) {
    return "";
  }
  return `\n🔭 You've been focused on ${focus.family} lately — ${focus.count.toString()} notes edited in the last week.\n`;
}
