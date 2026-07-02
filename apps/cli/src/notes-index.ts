/**
 * CLI binding of `@muse/recall`'s notes-index core. `reindexNotes` is wrapped
 * so its embeddings resolve the Ollama host through `resolveOllamaUrl`
 * (env merged with `muse setup model`'s `~/.muse/models.json`) — the package
 * default is env-only. Everything else re-exports unchanged;
 * `extractDocumentText` keeps its historical CLI name (the package calls it
 * `extractNoteText` to avoid clashing with the document reader's).
 */

import { reindexNotes as reindexNotesCore, type ReindexSummary } from "@muse/recall";

import { resolveOllamaUrl } from "./ollama-url.js";

export {
  NOTE_FILE_RE,
  NOTES_INDEX_SCHEMA_VERSION,
  cosine,
  defaultIndexPath,
  extractNoteText as extractDocumentText,
  formatReindexOutcome,
  isNotesIndexStale,
  isNotesIndexValid,
  loadIndex,
  noteCentroid,
  parseRagBoundedInt,
  rankRelatedNotes,
  resolveIndexNotePath,
  walkMarkdown,
  type RelatedNote,
  type ReindexSummary
} from "@muse/recall";

export async function reindexNotes(
  options: Omit<Parameters<typeof reindexNotesCore>[0], "baseUrlResolver">
): Promise<ReindexSummary> {
  return reindexNotesCore({ baseUrlResolver: resolveOllamaUrl, ...options });
}
