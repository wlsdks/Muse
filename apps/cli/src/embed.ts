/**
 * CLI binding of `@muse/recall`'s embedding helper: every CLI embed call
 * resolves the Ollama host through `resolveOllamaUrl` (env merged with
 * `muse setup model`'s `~/.muse/models.json`), which the package cannot do
 * itself (it must not depend on `@muse/autoconfigure` — that would cycle).
 */

import { embed as embedCore, type EmbedOptions } from "@muse/recall";

import { resolveOllamaUrl } from "./ollama-url.js";

export { cosineSimilarity, DEFAULT_EMBED_TIMEOUT_MS, type EmbedOptions } from "@muse/recall";

export async function embed(text: string, model: string, options: EmbedOptions = {}): Promise<number[]> {
  return embedCore(text, model, { baseUrlResolver: resolveOllamaUrl, ...options });
}
