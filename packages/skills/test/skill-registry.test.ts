import { describe, expect, it } from "vitest";

import type { Skill } from "../src/skill-contract.js";
import { InMemorySkillRegistry } from "../src/skill-registry.js";

function skill(name: string, overrides: Partial<Skill> = {}): Skill {
  return {
    body: `# ${name}\n\nInstructions for ${name}.`,
    description: `${name} description`,
    frontmatter: { description: `${name} description`, name },
    name,
    sourceInfo: { baseDir: `/tmp/${name}`, filePath: `/tmp/${name}/SKILL.md`, source: "user" },
    ...overrides
  };
}

describe("InMemorySkillRegistry", () => {
  it("registers a skill and gets it back by name", () => {
    const reg = new InMemorySkillRegistry();
    reg.register(skill("gh"));
    expect(reg.get("gh")?.name).toBe("gh");
    expect(reg.get("missing")).toBeUndefined();
  });

  it("lists skills sorted by name", () => {
    const reg = new InMemorySkillRegistry();
    reg.register(skill("codex"));
    reg.register(skill("gh"));
    reg.register(skill("ant"));
    expect(reg.list().map((s) => s.name)).toEqual(["ant", "codex", "gh"]);
  });

  it("a second register of the same name overwrites (last wins)", () => {
    const reg = new InMemorySkillRegistry();
    reg.register(skill("gh", { description: "first" }));
    reg.register(skill("gh", { description: "second" }));
    expect(reg.list()).toHaveLength(1);
    expect(reg.get("gh")?.description).toBe("second");
  });

  it("unregister removes the skill and reports whether it existed", () => {
    const reg = new InMemorySkillRegistry();
    reg.register(skill("gh"));
    expect(reg.unregister("gh")).toBe(true);
    expect(reg.get("gh")).toBeUndefined();
    expect(reg.unregister("gh")).toBe(false);
  });

  it("seeds from an initial iterable passed to the constructor", () => {
    const reg = new InMemorySkillRegistry([skill("a"), skill("b")]);
    expect(reg.list().map((s) => s.name)).toEqual(["a", "b"]);
  });
});
