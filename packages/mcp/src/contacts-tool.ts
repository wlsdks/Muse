/**
 * `find_contact` agent tool — look up one of the user's contacts by
 * name/alias so a `muse ask` conversation can answer "what's Jane's
 * email?" / "who is Bob?". Read-only; reuses `resolveContact`'s
 * fail-close semantics (an ambiguous name returns the candidates, never
 * a guessed person — the recipient-resolution backbone of
 * outbound-safety). No approval gate (read).
 */

import type { JsonObject } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

import { resolveContact, type Contact } from "./personal-contacts-store.js";

export interface ContactsFindToolDeps {
  readonly contacts: () => Promise<readonly Contact[]> | readonly Contact[];
}

export function createContactsFindTool(deps: ContactsFindToolDeps): MuseTool {
  return {
    definition: {
      description:
        "Look up one of the user's contacts by name or alias and return their email / handle / birthday. Use when you need a person's contact details, their birthday, or to confirm who someone is. An ambiguous name returns the candidate names (never a guess); an unknown name returns found:false. Read-only.",
      domain: "messaging",
      inputSchema: {
        additionalProperties: false,
        properties: {
          name: { description: "Contact name or alias to look up, e.g. 'Bob' or 'Jane Doe'.", type: "string" }
        },
        required: ["name"],
        type: "object"
      },
      keywords: ["contact", "email", "address", "who", "person", "handle", "birthday"],
      name: "find_contact",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const name = typeof args["name"] === "string" ? args["name"].trim() : "";
      if (name.length === 0) {
        return { found: false, reason: "name is required (e.g. Bob)" };
      }
      const resolution = resolveContact(await Promise.resolve(deps.contacts()), name);
      if (resolution.status === "resolved") {
        const c = resolution.contact;
        return {
          found: true,
          name: c.name,
          ...(c.email ? { email: c.email } : {}),
          ...(c.handle ? { handle: c.handle } : {}),
          ...(c.birthday ? { birthday: c.birthday } : {})
        };
      }
      if (resolution.status === "ambiguous") {
        return { ambiguous: true, candidates: resolution.matches.map((m) => m.name), found: false };
      }
      return { found: false };
    }
  };
}
