import { describe, expect, it } from "vitest";

import { createContactsFindTool, type Contact } from "../src/index.js";

const PEOPLE: Contact[] = [
  { email: "bob@acme.com", id: "c1", name: "Bob Acme" },
  { handle: "@jane", id: "c2", name: "Jane Doe" },
  { email: "bobby1@x.com", id: "c3", name: "Bobby One" },
  { email: "bobby2@x.com", id: "c4", name: "Bobby Two" }
];

function tool(people: Contact[] = PEOPLE) {
  return createContactsFindTool({ contacts: () => people });
}

describe("createContactsFindTool — look up a person", () => {
  it("is risk:read and resolves an exact name to email/handle", async () => {
    expect(tool().definition.risk).toBe("read");
    expect(await tool().execute({ name: "Bob Acme" })).toMatchObject({ email: "bob@acme.com", found: true, name: "Bob Acme" });
    expect(await tool().execute({ name: "Jane Doe" })).toMatchObject({ found: true, handle: "@jane" });
  });

  it("returns the candidates (never a guess) for an ambiguous name", async () => {
    const out = await tool().execute({ name: "Bobby" }) as { found: boolean; ambiguous?: boolean; candidates?: string[] };
    expect(out.found).toBe(false);
    expect(out.ambiguous).toBe(true);
    expect(out.candidates).toEqual(expect.arrayContaining(["Bobby One", "Bobby Two"]));
  });

  it("returns found:false for an unknown name and for an empty name (no guess)", async () => {
    expect(await tool().execute({ name: "Carol" })).toMatchObject({ found: false });
    expect(await tool().execute({ name: "  " })).toMatchObject({ found: false });
  });
});
