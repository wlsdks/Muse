/**
 * Liveness filters for recall corpora — entries whose backing file / episode
 * no longer exists are excluded before ranking, so a deleted note can't be
 * cited as evidence (a ghost citation would break "shows its work").
 */

export function filterLiveNoteIndexFiles<T extends { readonly path: string }>(
  files: readonly T[],
  exists: (path: string) => boolean
): T[] {
  return files.filter((file) => exists(file.path));
}

export function filterLiveEpisodeEntries<T extends { readonly id: string }>(
  entries: readonly T[],
  liveIds: ReadonlySet<string>
): T[] {
  return entries.filter((entry) => liveIds.has(entry.id));
}
