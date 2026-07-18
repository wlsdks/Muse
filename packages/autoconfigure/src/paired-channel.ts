/**
 * Day-rhythm's channel auto-routing: resolve the SINGLE paired messaging
 * channel so a briefing/digest tick can send to it instead of the "log"
 * sink default when the user turned day-rhythm on but never separately
 * configured `--provider`/`--destination`. Shared by apps/cli (daemon
 * ticks + doctor) and apps/api (day-rhythm routes) — a package, not
 * either app, because apps/api cannot depend on apps/cli.
 */

import { promises as fs } from "node:fs";

import { isRecord, parseJson } from "@muse/shared";

/**
 * Reads one provider's paired-owner chat id from `~/.muse/channel-owners.json`
 * (`MUSE_CHANNEL_OWNERS_FILE`) — the same file `apps/api/src/
 * channel-owner-store.ts`'s `readChannelOwner` reads, reimplemented here
 * (not imported) because apps/cli cannot depend on apps/api, the identical
 * constraint `model-registry.ts`'s `readMuseCliConfigFile` documents for the
 * CLI config file. Absent/malformed file ⇒ no owner (fail-close, never
 * throws).
 */
export async function readChannelOwner(file: string, providerId: string): Promise<string | undefined> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
  const parsed = parseJson(text);
  if (!isRecord(parsed) || !isRecord(parsed.owners)) {
    return undefined;
  }
  const owner = parsed.owners[providerId];
  return typeof owner === "string" && owner.trim().length > 0 ? owner : undefined;
}

/** The channel-pairing surface's connectable provider ids (mirrors apps/api's `CONNECTABLE`). */
export const PAIRABLE_MESSAGING_PROVIDER_IDS = ["telegram", "discord", "slack", "line", "matrix"] as const;

export interface PairedChannel {
  readonly providerId: string;
  readonly destination: string;
}

/**
 * Resolves the day-rhythm auto-route target: the ONE paired AND
 * live-registered messaging channel. Zero paired channels, or more than
 * one, both return `undefined` — auto-routing never guesses which channel
 * the user means (fail-close, mirrors outbound-safety's "recipient
 * resolved, never guessed" rule).
 */
export async function resolveSinglePairedChannel(
  ownersFile: string,
  registry: { readonly has: (providerId: string) => boolean }
): Promise<PairedChannel | undefined> {
  const candidates: PairedChannel[] = [];
  for (const providerId of PAIRABLE_MESSAGING_PROVIDER_IDS) {
    if (!registry.has(providerId)) {
      continue;
    }
    const owner = await readChannelOwner(ownersFile, providerId);
    if (owner) {
      candidates.push({ destination: owner, providerId });
    }
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
