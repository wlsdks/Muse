import { describe, expect, it } from "vitest";

import { buildContactContextBlock } from "./select.js";

function contact(over: Record<string, unknown> = {}) {
  return { id: "c1", name: "Sarah", ...over } as never;
}

describe("buildContactContextBlock — <<contact N>> grounding block", () => {
  it("empty → placeholder", () => {
    expect(buildContactContextBlock([])).toBe("(no matching contacts)");
  });
  it("bare contact: just name + [contact: <name>] citation, no fields suffix", () => {
    const block = buildContactContextBlock([contact()]);
    expect(block).toBe("<<contact 1 — c1>>\nSarah\n[contact: Sarah]\n<<end>>");
    expect(block).not.toContain("[contact: c1]");
  });
  it("joins present fields (relationship/email/phone/handle/birthday/connections/notes) in order, comma-separated", () => {
    const block = buildContactContextBlock([contact({
      relationship: "sister", email: "s@x.com", phone: "555", handle: "@sar",
      birthday: "03-14", connections: [{ as: "works with", to: "Bob" }], about: "allergic to nuts"
    })]);
    expect(block).toContain("Sarah — your sister, email s@x.com, phone 555, handle @sar, birthday March 14, connections: works with Bob, notes: allergic to nuts");
  });
  it("connection without `as` falls back to 'connected to'", () => {
    const block = buildContactContextBlock([contact({ connections: [{ to: "Alice" }] })]);
    expect(block).toContain("connections: connected to Alice");
  });
  it("separates multiple contacts with a blank line", () => {
    const block = buildContactContextBlock([contact({ name: "A" }), contact({ id: "c2", name: "B" })]);
    expect(block).toContain("<<end>>\n\n<<contact 2");
  });
});
