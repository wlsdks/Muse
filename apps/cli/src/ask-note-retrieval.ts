/**
 * CLI binding of `@muse/recall`'s notes retrieval stage — embeds through the
 * CLI's models.json-merged endpoint (the package default is env-only).
 */

import {
  retrieveAndRankNotes as retrieveAndRankNotesCore,
  type NoteRetrievalResult
} from "@muse/recall";

import { embed } from "./embed.js";

export type { NoteRetrievalResult } from "@muse/recall";

type CoreParams = Parameters<typeof retrieveAndRankNotesCore>[0];

export async function retrieveAndRankNotes(
  params: Omit<CoreParams, "embedFn">
): Promise<NoteRetrievalResult> {
  return retrieveAndRankNotesCore({ ...params, embedFn: embed });
}
