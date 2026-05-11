/**
 * File-backed InboxContextProvider implementation
 * (Context Engineering Phase 2).
 *
 * Reads each registered provider's persisted inbox file
 * (`appendInbound` populates it from polling daemons / webhooks)
 * and returns the messages newer than the per-source "last injected"
 * cursor. Advances the cursor BEFORE returning so the same message
 * does not show up next turn.
 *
 * Caller wires this into `AgentRuntime.inboxContextProvider`.
 */

import { readInbox } from "./inbox-store.js";
import { advanceInboxInjectionCursor, readInboxInjectionCursor } from "./inbox-injection-cursor.js";
import type { InboundMessage } from "./types.js";

export interface InboxSourceConfig {
  readonly providerId: string;
  /** Absolute path to the inbox JSON file written by the daemon. */
  readonly inboxFile: string;
  /** Absolute path to the per-provider cursor file. */
  readonly cursorFile: string;
}

export interface FileBackedInboxContextProviderOptions {
  readonly sources: readonly InboxSourceConfig[];
  /** Per-provider max messages surfaced per resolve. Default 20. */
  readonly perProviderLimit?: number;
  /** Hard cap across all providers in one resolve. Default 80. */
  readonly totalLimit?: number;
}

export interface InboundSummary {
  readonly providerId: string;
  readonly source: string;
  readonly sender?: string;
  readonly receivedAtIso: string;
  readonly text: string;
}

export interface InboxSnapshot {
  readonly messages: readonly InboundSummary[];
  readonly totalByProvider: Readonly<Record<string, number>>;
}

const DEFAULT_PER_PROVIDER_LIMIT = 20;
const DEFAULT_TOTAL_LIMIT = 80;

export class FileBackedInboxContextProvider {
  private readonly sources: readonly InboxSourceConfig[];
  private readonly perProviderLimit: number;
  private readonly totalLimit: number;

  constructor(options: FileBackedInboxContextProviderOptions) {
    this.sources = options.sources;
    this.perProviderLimit = Math.max(1, options.perProviderLimit ?? DEFAULT_PER_PROVIDER_LIMIT);
    this.totalLimit = Math.max(1, options.totalLimit ?? DEFAULT_TOTAL_LIMIT);
  }

  async resolve(): Promise<InboxSnapshot | undefined> {
    const allFresh: InboundSummary[] = [];
    const totals: Record<string, number> = {};
    for (const config of this.sources) {
      try {
        const cursor = await readInboxInjectionCursor(config.cursorFile);
        const inbox = await readInbox(config.inboxFile, this.perProviderLimit * 4);
        const fresh = filterFresh(inbox, cursor, this.perProviderLimit);
        if (fresh.length === 0) {
          continue;
        }
        totals[config.providerId] = (totals[config.providerId] ?? 0) + fresh.length;
        for (const message of fresh) {
          allFresh.push(toSummary(message));
        }
        const advance: Record<string, string> = {};
        for (const message of fresh) {
          const existing = advance[message.source];
          if (!existing || message.receivedAtIso > existing) {
            advance[message.source] = message.receivedAtIso;
          }
        }
        await advanceInboxInjectionCursor(config.cursorFile, advance);
      } catch {
        // fail-open per source
      }
    }
    if (allFresh.length === 0) {
      return undefined;
    }
    const capped = allFresh.slice(0, this.totalLimit);
    return { messages: capped, totalByProvider: totals };
  }
}

export function filterFresh(
  inbox: readonly InboundMessage[],
  cursor: Readonly<Record<string, string>>,
  perProviderLimit: number
): readonly InboundMessage[] {
  const sorted = [...inbox].sort((a, b) => a.receivedAtIso.localeCompare(b.receivedAtIso));
  const fresh = sorted.filter((message) => {
    const last = cursor[message.source];
    return !last || message.receivedAtIso > last;
  });
  return fresh.slice(-perProviderLimit);
}

function toSummary(message: InboundMessage): InboundSummary {
  return {
    providerId: message.providerId,
    receivedAtIso: message.receivedAtIso,
    sender: message.sender,
    source: message.source,
    text: message.text
  };
}
