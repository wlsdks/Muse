import { contentTokens } from "./provenance-tokens.js";

const DEFAULT_MAX_SPANS = 64;
const DEFAULT_MAX_CHARS_PER_SPAN = 8000;

export interface UntrustedSpan {
  readonly source: string;
  readonly text: string;
}

export interface TaintLedger {
  recordUntrusted(source: string, text: string): void;
  untrustedSpans(): readonly UntrustedSpan[];
  untrustedTokens(): ReadonlySet<string>;
  /**
   * Record output that came from one of the USER'S OWN stores (a note they
   * wrote, their calendar, their task list). Such content is a FIRST-PARTY
   * origin, not third-party tool output — a write built from it ("add my
   * note's action item as a task") must not read as fabricated. Kept separate
   * from the untrusted spans so the outbound-send / execute gates are
   * unaffected: only the write-sink gate consults this.
   */
  recordFirstParty(source: string, text: string): void;
  /** Concatenated first-party text — a haystack extension for the write gate. */
  firstPartyHaystack(): string;
}

/**
 * Per-run ledger of untrusted (tool-output-derived) text spans — the
 * provenance-tracking half of a FIDES-style taint gate (arXiv 2505.23643).
 * Bounded memory: oldest spans are evicted once maxSpans is exceeded, and
 * each span's text is truncated to maxCharsPerSpan so one huge tool result
 * can't blow up per-run state.
 */
export function createTaintLedger(options?: { maxSpans?: number; maxCharsPerSpan?: number }): TaintLedger {
  const maxSpans = options?.maxSpans ?? DEFAULT_MAX_SPANS;
  const maxCharsPerSpan = options?.maxCharsPerSpan ?? DEFAULT_MAX_CHARS_PER_SPAN;
  const spans: UntrustedSpan[] = [];
  const firstParty: string[] = [];
  let tokenCache: Set<string> | null = null;

  return {
    recordFirstParty(source: string, text: string): void {
      if (text.trim().length === 0) {
        return;
      }
      const truncated = text.length > maxCharsPerSpan ? text.slice(0, maxCharsPerSpan) : text;
      firstParty.push(truncated);
      while (firstParty.length > maxSpans) {
        firstParty.shift();
      }
    },
    firstPartyHaystack(): string {
      return firstParty.join("\n");
    },
    recordUntrusted(source: string, text: string): void {
      if (text.trim().length === 0) {
        return;
      }
      const truncated = text.length > maxCharsPerSpan ? text.slice(0, maxCharsPerSpan) : text;
      spans.push({ source, text: truncated });
      while (spans.length > maxSpans) {
        spans.shift();
      }
      tokenCache = null;
    },
    untrustedSpans(): readonly UntrustedSpan[] {
      return spans.slice();
    },
    untrustedTokens(): ReadonlySet<string> {
      if (tokenCache === null) {
        const union = new Set<string>();
        for (const span of spans) {
          for (const token of contentTokens(span.text)) {
            union.add(token);
          }
        }
        tokenCache = union;
      }
      return tokenCache;
    }
  };
}
