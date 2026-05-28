import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSkillRegistry } from "../src/personal-providers.js";
import type { MuseEnvironment } from "../src/index.js";

function writeSkill(root: string, folder: string, name: string, body: string): void {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n\n${body}\n`);
}

describe("buildSkillRegistry — authored is lowest precedence", () => {
  it("a same-named user skill overrides the authored one", async () => {
    const base = mkdtempSync(join(tmpdir(), "muse-prec-"));
    const userDir = join(base, "user-skills");
    const authoredDir = join(base, "authored-skills");
    writeSkill(userDir, "dup", "dup", "USER WINS");
    writeSkill(authoredDir, "dup", "dup", "AUTHORED LOSES");
    const env = { MUSE_SKILLS_DIR: userDir, MUSE_AUTHORED_SKILLS_DIR: authoredDir } as unknown as MuseEnvironment;
    const registry = await buildSkillRegistry(env);
    expect(registry!.get("dup")!.body).toBe("USER WINS");
  });

  it("authored-only skills still load when no user skill shadows them", async () => {
    const base = mkdtempSync(join(tmpdir(), "muse-prec-"));
    const userDir = join(base, "user-skills");
    const authoredDir = join(base, "authored-skills");
    mkdirSync(userDir, { recursive: true });
    writeSkill(authoredDir, "learned-x", "learned-x", "AUTHORED BODY");
    const env = { MUSE_SKILLS_DIR: userDir, MUSE_AUTHORED_SKILLS_DIR: authoredDir } as unknown as MuseEnvironment;
    const registry = await buildSkillRegistry(env);
    expect(registry!.get("learned-x")!.body).toBe("AUTHORED BODY");
  });
});
