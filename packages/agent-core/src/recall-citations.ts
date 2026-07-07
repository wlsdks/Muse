/**
 * Output-side citation enforcement + normalisation for the recall wedge — the
 * code-not-model half of "shows its work". `enforceAnswerCitations` is the gate:
 * it strips (or drops the whole sentence for) any citation whose target is NOT a
 * real source Muse showed the model, so a fabricated citation can never reach the
 * user BY CODE. The `normalize*Citations` helpers rewrite the local model's
 * natural-but-wrong citation forms (contact / memory / structured-class / slot)
 * to the canonical shape the gate accepts, BEFORE the gate runs, so a correctly
 * grounded answer isn't false-stripped for a formatting mismatch.
 */

import {
  type AllowedCitations,
  CITATION_RE,
  type CitationEnforcement
} from "./grounding-citations.js";
import { lexicalTokens, normalizeForRecall } from "./recall-lexical.js";

function resolvesExact(value: string, allowed: readonly string[]): boolean {
  // NFC both sides so a KO citation marker (e.g. a Hangul note title) resolves to its source
  // regardless of NFD/NFC origin — the sibling of the lexical tokeniser's normalisation.
  const v = normalizeForRecall(value).trim().toLowerCase();
  return allowed.some((item) => normalizeForRecall(item).trim().toLowerCase() === v);
}

// Free-text citations (task/event/reminder titles): the model may PARAPHRASE
// the title, so an exact match would false-strip a real one. A citation
// resolves when it shares any CONTENT token with a real item of that type; a
// wholly-invented title (no overlap with anything the user has) is stripped.
function resolvesByOverlap(value: string, allowed: readonly string[]): boolean {
  const tokens = lexicalTokens(value);
  if (tokens.size === 0) {
    return false;
  }
  return allowed.some((item) => {
    const itemTokens = lexicalTokens(item);
    for (const token of tokens) {
      if (itemTokens.has(token)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Rewrite the local model's natural-but-wrong contact citations to the
 * canonical `[contact: <name>]` form the gate accepts — BEFORE
 * `enforceAnswerCitations` runs. A `<<contact N — id>>` wrapper is a structural
 * sibling of the `<<note N — file>>` wrapper the model cites as `[from file]`,
 * so qwen3:8b tends to cite a contact with the note verb or by slot/id —
 * `[from contact 1]`, `[from contact: mina]`, `[contact 1]` — which the
 * exact-match note gate then false-strips, firing a spurious "treat as
 * unverified" warning on a correctly-grounded answer about the user's OWN
 * address book. This maps every "contact"-anchored mis-form to
 * `[contact: <name>]` by code: an in-range slot number, or an id / name that
 * token-overlaps a real matched contact, resolves to that contact's name; an
 * unresolvable reference (`[from contact 9]`) is left untouched for the gate to
 * strip. Pure + deterministic; only touches a citation whose first token is
 * literally `contact`, so a real `[from contacts.md]` note citation is never
 * rewritten.
 */
export function normalizeContactCitations(
  answer: string,
  contacts: ReadonlyArray<{ readonly id: string; readonly name: string }>
): string {
  if (contacts.length === 0) {
    return answer;
  }
  const resolveName = (ref: string): string | undefined => {
    const trimmed = ref.trim();
    if (/^\d+$/u.test(trimmed)) {
      const slot = Number(trimmed);
      return slot >= 1 && slot <= contacts.length ? contacts[slot - 1]?.name : undefined;
    }
    const low = trimmed.toLowerCase();
    const exact = contacts.find((c) => c.id.toLowerCase() === low || c.name.toLowerCase() === low);
    if (exact) {
      return exact.name;
    }
    const refTokens = lexicalTokens(trimmed);
    if (refTokens.size === 0) {
      return undefined;
    }
    const overlap = contacts.find((c) => {
      const nameTokens = lexicalTokens(c.name);
      for (const token of refTokens) {
        if (nameTokens.has(token)) {
          return true;
        }
      }
      return false;
    });
    return overlap?.name;
  };
  const withContactVerb = answer.replace(
    /\[\s*(?:from\s+)?contact\s*(?:[:#-]\s*|\s+)([^\]]+?)\s*\]/giu,
    (match: string, ref: string) => {
      const name = resolveName(ref);
      return name ? `[contact: ${name}]` : match;
    }
  );
  // Also catch the bare NOTE-verb form `[from <X>]` where <X> is the raw
  // `contact_<uuid>` id (or the full contact name) the model echoed — the
  // `contact`-anchored pass above misses it because the id is `contact_<uuid>`
  // (no "contact" + separator). Only an EXACT id / name match is rewritten
  // (separator- and case-insensitive, never a fuzzy token overlap), so a real
  // `[from note.md]` is never mistaken for a contact.
  const normRef = (value: string): string => value.trim().toLowerCase().replace(/[\s_-]+/gu, " ");
  const exactContactName = (ref: string): string | undefined => {
    const low = ref.trim().toLowerCase();
    const n = normRef(ref);
    const hit = contacts.find((c) => c.id.toLowerCase() === low || normRef(c.id) === n || normRef(c.name) === n);
    return hit?.name;
  };
  return withContactVerb.replace(
    /\[from\s+([^\]]+?)\s*\]/giu,
    (match: string, ref: string) => {
      const name = exactContactName(ref);
      return name ? `[contact: ${name}]` : match;
    }
  );
}

/**
 * Rewrite a remembered-fact cited with the NOTE verb to the canonical
 * `[memory: <key>]` form — the local model (especially in Korean, where the
 * `[memory: …]` hint block isn't injected because the query doesn't lexically
 * match the English fact key) tends to cite a fact it knows from the persona as
 * `[from car_license_plate]`, which the exact-match note gate then false-strips.
 * Only a `[from <X>]` whose `<X>` EXACTLY matches a known memory key (separator /
 * case-insensitive) is rewritten; a real `[from note.md]` is left untouched, so a
 * note citation is never mistaken for a memory.
 */
export function normalizeMemoryCitations(answer: string, memoryKeys: readonly string[]): string {
  if (memoryKeys.length === 0) {
    return answer;
  }
  const norm = (value: string): string => value.trim().toLowerCase().replace(/[\s_-]+/gu, " ");
  const keys = new Set(memoryKeys.map(norm));
  return answer.replace(
    /\[from\s+([^\]]+?)\s*\]/giu,
    (match: string, ref: string) => (keys.has(norm(ref)) ? `[memory: ${ref.trim()}]` : match)
  );
}

/**
 * Strip the redundant note-verb "from " the model sometimes prepends to a
 * STRUCTURED citation — `[from commit: …]`, `[from task: …]`, `[from event: …]` —
 * so it reads as the canonical `[commit: …]` / `[task: …]` the gate validates by
 * class. Without this, the note regex (`[from <X>]`) mis-catches it first and
 * false-strips a TRUE structured citation as a non-existent note. Only a KNOWN
 * class keyword + ":" is rewritten, so a real `[from note.md]` is never touched.
 */
export function normalizeFromPrefixedCitations(answer: string): string {
  return answer.replace(
    /\[from\s+(task|event|reminder|session|feed|browsing|contact|command|commit|memory|action)\s*:/giu,
    "[$1:"
  );
}

/**
 * Rewrite a STRUCTURED citation the model wrote by SLOT NUMBER — `[from session 1]`,
 * `[from event 2]` — into the canonical `[<class>: <that slot's content>]` the gate
 * validates by class. The grounding markers are slot-numbered (`<<session N — id>>`),
 * so a reasoning-off model often cites the slot rather than the title; without this
 * the note regex mis-catches `[from session 1]` and false-strips a TRUE recall.
 * `slotsByClass` maps each class to the ORDERED list shown to the model (slot N →
 * index N-1); an out-of-range slot is left untouched for the gate to judge.
 */
export function normalizeSlotCitations(
  answer: string,
  slotsByClass: Readonly<Record<string, readonly string[]>>
): string {
  return answer.replace(
    // `[from session 1]`, the bare `[feed 1]` (the model often drops "from" for the
    // slot-numbered markers `<<feed N — name>>`), or `[from session 1 — ep_001]`
    // when it echoes the marker whole — the optional "from " and trailing "— <id>"
    // are both ignored.
    /\[(?:from\s+)?(task|event|reminder|session|feed|browsing|contact|command|commit|memory|action)\s+(\d+)(?:\s*[—–-]\s*[^\]]*)?\s*\]/giu,
    (match: string, cls: string, num: string) => {
      const list = slotsByClass[cls.toLowerCase()];
      const content = list?.[Number.parseInt(num, 10) - 1];
      return content ? `[${cls.toLowerCase()}: ${content}]` : match;
    }
  );
}

/**
 * Output-side grounding gate for the recall WEDGE — the code-not-model half of
 * "shows its work". Strips ANY citation the answer makes — `[from <note>]`,
 * `[feed: <name>]`, `[task|event|reminder: <title>]` — whose target is NOT
 * among the real sources Muse actually showed the model, so a fabricated
 * citation to something the user doesn't have can never reach them BY CODE
 * (mirrors `parseReflections` / `parseCouncilAnswer`). Notes + feeds match
 * exactly (they are identifiers); the free-text title forms match on
 * content-token overlap so a paraphrased-but-real citation survives — including
 * `[session: …]`, matched against the retrieved past-session summaries.
 */
/**
 * The citation classes the gate validates. `certainOnStrip` marks the classes
 * resolved by lexical OVERLAP (free-text titles): a non-resolving overlap citation
 * shares ZERO content token with anything the user has = a CERTAIN invention, so the
 * whole claim it grounds is dropped. The EXACT classes (notes/feeds — matched by
 * path/name) carry a false-strip risk (a real note cited with a formatting mismatch),
 * so a non-resolving one only loses its marker (+ a downstream "unverified" warning),
 * never the claim — dropping there could delete a TRUE but mis-cited fact.
 */
const CITATION_CLASSES: readonly {
  readonly re: RegExp;
  readonly key: keyof AllowedCitations;
  readonly resolves: (value: string, allowed: readonly string[]) => boolean;
  readonly certainOnStrip: boolean;
}[] = [
  { certainOnStrip: false, key: "notes", re: CITATION_RE, resolves: resolvesExact },
  { certainOnStrip: false, key: "feeds", re: /\[feed:\s*([^\]]+?)\s*\]/giu, resolves: resolvesExact },
  { certainOnStrip: false, key: "browsing", re: /\[browsing:\s*([^\]]+?)\s*\]/giu, resolves: resolvesExact },
  { certainOnStrip: true, key: "tasks", re: /\[task:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "events", re: /\[event:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "reminders", re: /\[reminder:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "sessions", re: /\[session:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "contacts", re: /\[contact:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "commands", re: /\[command:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "commits", re: /\[commit:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "memories", re: /\[memory:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap },
  { certainOnStrip: true, key: "actions", re: /\[action:\s*([^\]]+?)\s*\]/giu, resolves: resolvesByOverlap }
];

/**
 * Split `text` into sentences LOSSLESSLY (`split.join("") === text`): a boundary is
 * `.`/`!`/`?`/newline at bracket depth 0 (a `.` inside a `[from a.md]` citation is
 * NOT a boundary), extended over consecutive terminators + trailing inline whitespace
 * so the delimiter stays with its sentence and a rejoin is byte-exact.
 */
function splitCitationSentences(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { if (depth > 0) depth--; continue; }
    if (depth === 0 && (ch === "." || ch === "!" || ch === "?" || ch === "\n")) {
      let j = i + 1;
      while (j < text.length && (text[j] === "." || text[j] === "!" || text[j] === "?")) j++;
      while (j < text.length && (text[j] === " " || text[j] === "\t" || text[j] === "\n")) j++;
      out.push(text.slice(start, j));
      start = j;
      i = j - 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

export function enforceAnswerCitations(answer: string, allowed: AllowedCitations): CitationEnforcement {
  const stripped: string[] = [];
  const kept: string[] = [];
  for (const sentence of splitCitationSentences(answer)) {
    let hasValid = false;
    let hasCertainFabrication = false;
    for (const c of CITATION_CLASSES) {
      for (const m of sentence.matchAll(c.re)) {
        if (c.resolves(m[1]!.trim(), allowed[c.key] ?? [])) hasValid = true;
        else if (c.certainOnStrip) hasCertainFabrication = true;
      }
    }
    // DROP a sentence grounded ONLY on a certainly-fabricated overlap citation (no
    // surviving valid source of any class) — an un-groundable claim removed by code,
    // not laundered into an un-cited assertion. A sentence with ANY valid citation, or
    // whose only bad citation is an EXACT class (notes/feeds, false-strip risk), is
    // kept and merely loses the bad marker below.
    if (hasCertainFabrication && !hasValid) {
      for (const c of CITATION_CLASSES) {
        for (const m of sentence.matchAll(c.re)) {
          if (!c.resolves(m[1]!.trim(), allowed[c.key] ?? [])) stripped.push(m[1]!.trim());
        }
      }
      continue;
    }
    let s = sentence;
    for (const c of CITATION_CLASSES) {
      s = s.replace(c.re, (match: string, raw: string) => {
        const value = raw.trim();
        if (c.resolves(value, allowed[c.key] ?? [])) return match;
        stripped.push(value);
        return "";
      });
    }
    kept.push(s);
  }
  let text = kept.join("");
  // Only tidy whitespace when a citation was actually removed (the cleanup exists to
  // close the seam a stripped `[...]` / dropped sentence leaves). Running it on a CLEAN
  // answer collapses multi-space runs and mangles code-block indentation / aligned
  // columns — so leave an un-stripped answer byte-for-byte verbatim.
  if (stripped.length > 0) {
    text = text
      .replace(/[ \t]{2,}/gu, " ")
      .replace(/[ \t]+([.,;!?])/gu, "$1")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/[ \t]+$/u, ""); // a DROPPED trailing sentence leaves the prior one's trailing space
  }
  return { stripped, text };
}
