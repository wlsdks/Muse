# Autonomous Skill Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At session end, turn a procedural user *correction* into a durable, reusable, execute-gated `SKILL.md` the agent authored itself — picked up next session and selected by the local model on a similar request.

**Architecture:** Three decoupled layers wired by the CLI, mirroring the existing `distillSessionCorrections` end-of-session hook. (1) `@muse/skills` gains a dumb `AuthoredSkillStore` (serialize/write/patch/cap, execute-gate by type). (2) `@muse/agent-core` gains pure `skill-review` (deterministic `detectSkillCandidates` reusing `detectCorrections` + one local-Qwen `draftSkillFromSignal`). (3) `@muse/autoconfigure` registers the authored dir as the lowest-precedence loader root; `apps/cli` orchestrates at session end behind `MUSE_SKILL_AUTHOR_ENABLED`, fail-soft.

**Tech Stack:** TypeScript (strict, ESM, `.js` import specifiers), vitest, pnpm workspaces. Local Ollama Qwen for live verification. SKILL.md = `@muse/skills` parser format.

**Spec:** `docs/superpowers/specs/2026-05-29-autonomous-skill-authoring-design.md`

---

## File Structure

- `packages/skills/src/skill-contract.ts` — MODIFY: add `"authored"` to `SkillSource`.
- `packages/skills/src/authored-skill-store.ts` — CREATE: `SkillDraft`, `serializeAuthoredSkill`, `slugifySkillName`, `AuthoredSkillStore`.
- `packages/skills/src/index.ts` — MODIFY: export the new symbols.
- `packages/skills/test/authored-skill-store.test.ts` — CREATE.
- `packages/agent-core/src/skill-review.ts` — CREATE: `SkillReviewSignal`, `SkillDraft` (re-export skills'), `detectSkillCandidates`, `draftSkillFromSignal`.
- `packages/agent-core/src/index.ts` — MODIFY: export skill-review symbols.
- `packages/agent-core/test/skill-review.test.ts` — CREATE.
- `packages/autoconfigure/src/provider-paths.ts` — MODIFY: add `resolveAuthoredSkillsDir`.
- `packages/autoconfigure/src/personal-providers.ts` — MODIFY: prepend authored root in `buildSkillRegistry`.
- `packages/autoconfigure/src/index.ts` — MODIFY: export `resolveAuthoredSkillsDir`.
- `packages/autoconfigure/test/...` — extend an existing skills-registry test for precedence.
- `apps/cli/src/chat-author-skills.ts` — CREATE: `authorSkillsFromSession` orchestrator.
- `apps/cli/src/chat-author-skills.test.ts` — CREATE.
- `apps/cli/src/chat-ink.ts` — MODIFY (~line 1240-1252): third end-of-session step.
- `apps/cli/src/commands-skills.ts` — MODIFY or CREATE: `muse skills author` manual command (sibling of `muse playbook distill`).
- `docs/goals/CAPABILITIES.md`, `docs/goals/OUTWARD-TARGETS.md` — MODIFY on delivery.

Note on layering: `@muse/skills` must NOT import `@muse/agent-core`. The store takes an injected `similarity` fn (default local Jaccard). The CLI orchestrator is the only place that wires agent-core + skills together.

---

## Phase 1 — Persistence (`@muse/skills`)

### Task 1: `SkillSource` gains `"authored"` + serializer + store skeleton (create path)

**Files:**
- Modify: `packages/skills/src/skill-contract.ts:47`
- Create: `packages/skills/src/authored-skill-store.ts`
- Modify: `packages/skills/src/index.ts`
- Test: `packages/skills/test/authored-skill-store.test.ts`

- [ ] **Step 1: Add the `"authored"` source**

In `packages/skills/src/skill-contract.ts`, change line 47:

```ts
export type SkillSource = "user" | "workspace" | "bundled" | "remote" | "authored";
```

- [ ] **Step 2: Write the failing test for create + execute-gate**

Create `packages/skills/test/authored-skill-store.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseSkillFile } from "../src/skill-parser.js";
import { AuthoredSkillStore, serializeAuthoredSkill, slugifySkillName } from "../src/authored-skill-store.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "muse-authored-"));
}

describe("AuthoredSkillStore — create + execute-gate", () => {
  it("writes a parseable SKILL.md and tags it authored", async () => {
    const dir = tmpDir();
    const store = new AuthoredSkillStore({ dir, now: () => new Date("2026-05-29T00:00:00Z") });
    const res = await store.writeOrPatch({
      name: "summarise-with-bullets",
      description: "Use when the user asks for a summary; produce bullet points not prose.",
      body: "## Steps\n1. Read the source.\n2. Emit 3-5 bullets."
    });
    expect(res.action).toBe("create");
    const parsed = await parseSkillFile(res.skill.sourceInfo.filePath, { source: "authored" });
    expect(parsed.name).toBe("summarise-with-bullets");
    expect(parsed.frontmatter.metadata?.muse).toMatchObject({ authored: true });
  });

  it("NEVER emits requires — the execute-gate is structural", async () => {
    const dir = tmpDir();
    const store = new AuthoredSkillStore({ dir });
    // body/description even MENTION bins — must not leak into frontmatter.requires
    const res = await store.writeOrPatch({
      name: "danger",
      description: "requires gh and rm; bins: [rm]",
      body: "requires:\n  bins: [rm]\nrun rm -rf"
    });
    const parsed = await parseSkillFile(res.skill.sourceInfo.filePath, { source: "authored" });
    expect(parsed.frontmatter.requires).toBeUndefined();
  });

  it("slugifies names safely", () => {
    expect(slugifySkillName("Summarise With Bullets!")).toBe("summarise-with-bullets");
    expect(slugifySkillName("   ")).toBe("skill");
  });

  it("serializeAuthoredSkill round-trips through the parser", async () => {
    const text = serializeAuthoredSkill(
      { name: "n", description: "d", body: "B" },
      "2026-05-29T00:00:00Z"
    );
    expect(text).toContain("name: n");
    expect(text).toContain('metadata: {"muse":{"authored":true,"authoredAt":"2026-05-29T00:00:00Z"}}');
    expect(text.trimEnd().endsWith("B")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm --filter @muse/skills test -- authored-skill-store`
Expected: FAIL — cannot find module `../src/authored-skill-store.js`.

- [ ] **Step 4: Implement the serializer, slug, and the create path**

Create `packages/skills/src/authored-skill-store.ts`:

```ts
/**
 * Agent-authored skill persistence. Skills Muse writes about ITSELF
 * (from session-end review) live here, separate from human-authored
 * user/workspace skills. Execute-gated by type: a SkillDraft carries
 * only name/description/body, so an authored skill can never declare
 * requires.bins — muse.skills.run therefore refuses to execute it
 * until a human promotes it. Durability mirrors the plan-cache store
 * (atomic fsync+rename, 0600).
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { FileSystemSkillLoader } from "./skill-loader.js";
import type { Skill } from "./skill-contract.js";

export interface SkillDraft {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

export type AuthorAction = "create" | "patch" | "skip";

export interface AuthoredSkillStoreOptions {
  readonly dir: string;
  readonly maxSkills?: number;
  /** Non-authored skill names, best-effort, for collision suffixing. */
  readonly existingNames?: () => readonly string[];
  readonly now?: () => Date;
  /** 0..1 similarity used for create-vs-patch. Default: local Jaccard. */
  readonly similarity?: (a: string, b: string) => number;
}

export const DEFAULT_MAX_AUTHORED_SKILLS = 30;
const PATCH_SIMILARITY_THRESHOLD = 0.6;

export function slugifySkillName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/gu, "-").replace(/[^a-z0-9-]+/gu, "");
  return slug.length > 0 ? slug.slice(0, 64) : "skill";
}

export function serializeAuthoredSkill(draft: SkillDraft, authoredAt: string): string {
  const metadata = JSON.stringify({ muse: { authored: true, authoredAt } });
  return `---\nname: ${draft.name}\ndescription: ${draft.description}\nmetadata: ${metadata}\n---\n\n${draft.body.trim()}\n`;
}

function defaultSimilarity(a: string, b: string): number {
  const toks = (t: string): Set<string> =>
    new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3));
  const sa = toks(a);
  const sb = toks(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

async function writeFileAtomic(filePath: string, text: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  const handle = await fs.open(tmp, "w", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
  await fs.chmod(filePath, 0o600).catch(() => undefined);
}

export class AuthoredSkillStore {
  private readonly dir: string;
  private readonly maxSkills: number;
  private readonly existingNames: () => readonly string[];
  private readonly now: () => Date;
  private readonly similarity: (a: string, b: string) => number;

  constructor(options: AuthoredSkillStoreOptions) {
    this.dir = options.dir;
    this.maxSkills = options.maxSkills ?? DEFAULT_MAX_AUTHORED_SKILLS;
    this.existingNames = options.existingNames ?? (() => []);
    this.now = options.now ?? (() => new Date());
    this.similarity = options.similarity ?? defaultSimilarity;
  }

  async listAuthored(): Promise<readonly Skill[]> {
    return new FileSystemSkillLoader({ roots: [{ path: this.dir, source: "authored" }] }).loadAll();
  }

  async writeOrPatch(draft: SkillDraft): Promise<{ action: AuthorAction; skill: Skill }> {
    const name = this.dedupeName(draft.name);
    const slug = slugifySkillName(name);
    const filePath = join(this.dir, slug, "SKILL.md");
    await writeFileAtomic(filePath, serializeAuthoredSkill({ ...draft, name }, this.now().toISOString()));
    const skill = await this.reload(name);
    return { action: "create", skill };
  }

  private dedupeName(name: string): string {
    const taken = new Set(this.existingNames());
    if (!taken.has(name)) return name;
    for (let n = 1; ; n += 1) {
      const candidate = n === 1 ? `${name}-learned` : `${name}-learned-${n.toString()}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private async reload(name: string): Promise<Skill> {
    const all = await this.listAuthored();
    const found = all.find((s) => s.name === name);
    if (!found) throw new Error(`authored skill vanished after write: ${name}`);
    return found;
  }
}
```

- [ ] **Step 5: Export from the package index**

In `packages/skills/src/index.ts`, add to the export list:

```ts
export {
  AuthoredSkillStore,
  serializeAuthoredSkill,
  slugifySkillName,
  DEFAULT_MAX_AUTHORED_SKILLS,
  type SkillDraft,
  type AuthorAction,
  type AuthoredSkillStoreOptions
} from "./authored-skill-store.js";
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm --filter @muse/skills test -- authored-skill-store`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/skills/src/authored-skill-store.ts packages/skills/src/skill-contract.ts packages/skills/src/index.ts packages/skills/test/authored-skill-store.test.ts
git commit -m "feat(skills): authored-skill store — execute-gated create path"
```

---

### Task 2: Dedup → create / patch / skip

**Files:**
- Modify: `packages/skills/src/authored-skill-store.ts` (`writeOrPatch`)
- Test: `packages/skills/test/authored-skill-store.test.ts`

- [ ] **Step 1: Add failing tests for patch + skip**

Append to the test file:

```ts
describe("AuthoredSkillStore — dedup", () => {
  it("patches an existing similar skill instead of duplicating", async () => {
    const dir = tmpDir();
    const store = new AuthoredSkillStore({ dir });
    const first = await store.writeOrPatch({
      name: "summarise-with-bullets",
      description: "Use when the user asks for a summary; produce bullet points not prose.",
      body: "old body"
    });
    const second = await store.writeOrPatch({
      name: "summarise-with-bullets",
      description: "Use when the user asks for a summary; produce bullet points not prose.",
      body: "new improved body"
    });
    expect(second.action).toBe("patch");
    expect((await store.listAuthored())).toHaveLength(1);
    expect(second.skill.body).toContain("new improved body");
    expect(first.skill.sourceInfo.filePath).toBe(second.skill.sourceInfo.filePath);
  });

  it("skips a byte-identical re-write (idempotent)", async () => {
    const dir = tmpDir();
    const now = () => new Date("2026-05-29T00:00:00Z");
    const store = new AuthoredSkillStore({ dir, now });
    const draft = { name: "a", description: "d", body: "B" };
    await store.writeOrPatch(draft);
    const again = await store.writeOrPatch(draft);
    expect(again.action).toBe("skip");
  });
});
```

- [ ] **Step 2: Run, verify the patch test fails** (it currently always creates → list length 2)

Run: `pnpm --filter @muse/skills test -- authored-skill-store`
Expected: FAIL — patch test sees `action: "create"` / length 2.

- [ ] **Step 3: Implement create-vs-patch-vs-skip in `writeOrPatch`**

Replace the body of `writeOrPatch` with:

```ts
  async writeOrPatch(draft: SkillDraft): Promise<{ action: AuthorAction; skill: Skill }> {
    const authored = await this.listAuthored();
    const match = authored.find(
      (s) =>
        this.similarity(`${s.name} ${s.description}`, `${draft.name} ${draft.description}`) >=
        PATCH_SIMILARITY_THRESHOLD
    );
    if (match) {
      const text = serializeAuthoredSkill(
        { name: match.name, description: draft.description, body: draft.body },
        this.now().toISOString()
      );
      const existing = await fs.readFile(match.sourceInfo.filePath, "utf8").catch(() => "");
      if (stripAuthoredAt(existing) === stripAuthoredAt(text)) {
        return { action: "skip", skill: match };
      }
      await writeFileAtomic(match.sourceInfo.filePath, text);
      return { action: "patch", skill: await this.reload(match.name) };
    }
    const name = this.dedupeName(draft.name);
    const slug = slugifySkillName(name);
    const filePath = join(this.dir, slug, "SKILL.md");
    await writeFileAtomic(filePath, serializeAuthoredSkill({ ...draft, name }, this.now().toISOString()));
    return { action: "create", skill: await this.reload(name) };
  }
```

Add this helper near the other module functions (so the timestamp does not defeat idempotency):

```ts
function stripAuthoredAt(text: string): string {
  return text.replace(/"authoredAt":"[^"]*"/u, '"authoredAt":""').trim();
}
```

- [ ] **Step 4: Run, verify all pass**

Run: `pnpm --filter @muse/skills test -- authored-skill-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/skills/src/authored-skill-store.ts packages/skills/test/authored-skill-store.test.ts
git commit -m "feat(skills): dedup authored skills — patch on similarity, skip idempotent"
```

---

### Task 3: Cap + archive (never delete) + collision suffix

**Files:**
- Modify: `packages/skills/src/authored-skill-store.ts`
- Test: `packages/skills/test/authored-skill-store.test.ts`

- [ ] **Step 1: Add failing tests for cap-archive and collision suffix**

Append:

```ts
describe("AuthoredSkillStore — cap & collisions", () => {
  it("archives the oldest when over cap, never deletes", async () => {
    const dir = tmpDir();
    let t = 0;
    const store = new AuthoredSkillStore({ dir, maxSkills: 2, now: () => new Date(1_700_000_000_000 + (t += 1000)) });
    await store.writeOrPatch({ name: "one", description: "alpha topic", body: "1" });
    await store.writeOrPatch({ name: "two", description: "beta topic", body: "2" });
    await store.writeOrPatch({ name: "three", description: "gamma topic", body: "3" });
    const live = await store.listAuthored();
    expect(live.map((s) => s.name).sort()).toEqual(["three", "two"]);
    const { readdir } = await import("node:fs/promises");
    const archived = await readdir(join(dir, ".archive")).catch(() => []);
    expect(archived).toContain("one");
  });

  it("suffixes a name that collides with a non-authored skill", async () => {
    const dir = tmpDir();
    const store = new AuthoredSkillStore({ dir, existingNames: () => ["pdf"] });
    const res = await store.writeOrPatch({ name: "pdf", description: "x", body: "b" });
    expect(res.skill.name).toBe("pdf-learned");
  });
});
```

- [ ] **Step 2: Run, verify cap + collision tests fail**

Run: `pnpm --filter @muse/skills test -- authored-skill-store`
Expected: FAIL — no `.archive` dir; collision returns `pdf`.

- [ ] **Step 3: Implement `enforceCap` and call it after create**

Add to the class (and call `await this.enforceCap();` right before `return { action: "create", ... }` in `writeOrPatch`):

```ts
  private async enforceCap(): Promise<void> {
    const skills = await this.listAuthored();
    if (skills.length <= this.maxSkills) return;
    const withMtime = await Promise.all(
      skills.map(async (s) => ({
        s,
        mtime: (await fs.stat(s.sourceInfo.filePath).catch(() => undefined))?.mtimeMs ?? 0
      }))
    );
    withMtime.sort((a, b) => a.mtime - b.mtime); // oldest first
    const overflow = withMtime.slice(0, withMtime.length - this.maxSkills);
    for (const { s } of overflow) {
      const folder = s.sourceInfo.baseDir;
      const base = folder.split(/[\\/]/u).pop() ?? "skill";
      const dest = join(this.dir, ".archive", base);
      await fs.mkdir(dirname(dest), { recursive: true });
      await fs.rename(folder, dest).catch(() => undefined); // never delete
    }
  }
```

The `dedupeName` from Task 1 already suffixes; the collision test passes once `enforceCap` compiles (the `existingNames` path is already wired). Confirm `dedupeName` is applied on the create branch (it is).

- [ ] **Step 4: Run, verify all pass**

Run: `pnpm --filter @muse/skills test -- authored-skill-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/skills/src/authored-skill-store.ts packages/skills/test/authored-skill-store.test.ts
git commit -m "feat(skills): cap authored skills with archive-never-delete + collision suffix"
```

---

## Phase 2 — Core review (`@muse/agent-core`)

### Task 4: `SkillReviewSignal` + `detectSkillCandidates` (deterministic)

**Files:**
- Create: `packages/agent-core/src/skill-review.ts`
- Modify: `packages/agent-core/src/index.ts`
- Test: `packages/agent-core/test/skill-review.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/agent-core/test/skill-review.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { detectSkillCandidates } from "../src/skill-review.js";
import type { SessionTurnLine } from "../src/episodic-summariser.js";

const turn = (role: "user" | "assistant", content: string): SessionTurnLine => ({ content, role });

describe("detectSkillCandidates", () => {
  it("emits a correction signal when the user corrected the assistant", () => {
    const turns = [
      turn("user", "summarise this"),
      turn("assistant", "Here is a prose summary..."),
      turn("user", "no, that's wrong — always give me bullet points")
    ];
    const signals = detectSkillCandidates(turns);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.kind).toBe("correction");
  });

  it("returns nothing when there is no correction", () => {
    const turns = [turn("user", "hi"), turn("assistant", "hello")];
    expect(detectSkillCandidates(turns)).toHaveLength(0);
  });

  it("caps the number of candidates", () => {
    const turns: SessionTurnLine[] = [];
    for (let i = 0; i < 5; i += 1) {
      turns.push(turn("user", `ask ${i.toString()}`), turn("assistant", "ans"), turn("user", "no, that's not what i asked"));
    }
    expect(detectSkillCandidates(turns, { maxCandidates: 2 })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @muse/agent-core test -- skill-review`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `detectSkillCandidates`**

Create `packages/agent-core/src/skill-review.ts`:

```ts
/**
 * Session-end skill review (fork-and-review, after Hermes Agent).
 * Deterministic detection of which turns warrant authoring a reusable
 * SKILL, then ONE local-model generalisation per candidate. Slice 1
 * handles user corrections; the signal union leaves a seam for
 * complex-success in a later slice. Detection is a rule pass (a small
 * local model is an unreliable self-verifier, arXiv 2404.17140); only
 * generalisation uses the model.
 */

import type { ModelMessage, ModelProvider, ModelRequest } from "@muse/model";
import { redactSecretsInText } from "@muse/shared";

import { detectCorrections, type CorrectionExchange } from "./correction-distiller.js";
import type { SessionTurnLine } from "./episodic-summariser.js";

export type SkillReviewSignal = { readonly kind: "correction"; readonly exchange: CorrectionExchange };

export interface SkillDraft {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

export interface DetectSkillCandidatesOptions {
  readonly maxCandidates?: number;
}

export function detectSkillCandidates(
  turns: readonly SessionTurnLine[],
  options?: DetectSkillCandidatesOptions
): readonly SkillReviewSignal[] {
  const max = Math.max(1, Math.trunc(options?.maxCandidates ?? 2));
  return detectCorrections(turns, { maxExchanges: max }).map((exchange) => ({ exchange, kind: "correction" as const }));
}
```

- [ ] **Step 4: Export from index**

In `packages/agent-core/src/index.ts` add:

```ts
export {
  detectSkillCandidates,
  draftSkillFromSignal,
  type SkillReviewSignal,
  type SkillDraft,
  type DetectSkillCandidatesOptions,
  type DraftSkillOptions
} from "./skill-review.js";
```

(`draftSkillFromSignal` / `DraftSkillOptions` land in Task 5; add the export now so the index edit is single-touch — the symbols exist after Task 5 and the package won't build green until then. If executing strictly task-by-task with a build between, add only `detectSkillCandidates`, `SkillReviewSignal`, `SkillDraft`, `DetectSkillCandidatesOptions` here and the rest in Task 5.)

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @muse/agent-core test -- skill-review`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/skill-review.ts packages/agent-core/src/index.ts packages/agent-core/test/skill-review.test.ts
git commit -m "feat(agent-core): detect session-end skill candidates from corrections"
```

---

### Task 5: `draftSkillFromSignal` (one local-Qwen call, NONE → null)

**Files:**
- Modify: `packages/agent-core/src/skill-review.ts`
- Test: `packages/agent-core/test/skill-review.test.ts`

- [ ] **Step 1: Add failing tests with a fake provider**

Append to `skill-review.test.ts`:

```ts
import { draftSkillFromSignal, type SkillReviewSignal } from "../src/skill-review.js";

function fakeProvider(output: string): { generate: () => Promise<{ output: string }>; calls: number } {
  const p = { calls: 0, generate: async () => { p.calls += 1; return { output }; } };
  return p;
}

const correctionSignal: SkillReviewSignal = {
  kind: "correction",
  exchange: {
    correction: "no — when exporting, always convert to PDF first then attach",
    priorAnswer: "I attached the .docx.",
    request: "send the report to my manager"
  }
};

describe("draftSkillFromSignal", () => {
  it("parses a procedural draft", async () => {
    const provider = fakeProvider(
      "name: export-then-attach\ndescription: Use when sending a document; convert to PDF before attaching.\nbody:\n1. Convert to PDF.\n2. Attach the PDF."
    );
    const draft = await draftSkillFromSignal(correctionSignal, { model: "qwen", modelProvider: provider as never });
    expect(draft).not.toBeNull();
    expect(draft!.name).toBe("export-then-attach");
    expect(draft!.body).toContain("Convert to PDF");
  });

  it("returns null when the model says NONE (preference, not a procedure)", async () => {
    const provider = fakeProvider("NONE");
    expect(await draftSkillFromSignal(correctionSignal, { model: "qwen", modelProvider: provider as never })).toBeNull();
  });

  it("returns null on malformed output", async () => {
    const provider = fakeProvider("garbage with no fields");
    expect(await draftSkillFromSignal(correctionSignal, { model: "qwen", modelProvider: provider as never })).toBeNull();
  });

  it("returns null when generate throws (fail-soft)", async () => {
    const provider = { generate: async () => { throw new Error("model down"); } };
    expect(await draftSkillFromSignal(correctionSignal, { model: "qwen", modelProvider: provider as never })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @muse/agent-core test -- skill-review`
Expected: FAIL — `draftSkillFromSignal` not exported.

- [ ] **Step 3: Implement `draftSkillFromSignal` + parser**

Append to `packages/agent-core/src/skill-review.ts`:

```ts
export interface DraftSkillOptions {
  readonly modelProvider: Pick<ModelProvider, "generate">;
  readonly model: string;
  readonly redact?: (text: string) => string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

const DRAFTER_SYSTEM_PROMPT =
  `You decide whether a moment where the user CORRECTED the assistant reveals a
reusable, multi-step PROCEDURE worth saving as a skill — NOT a one-off
preference (those are handled elsewhere). If it is only a preference or style
nudge, output exactly:
NONE
Otherwise output exactly these three fields and nothing else:
name: <short-kebab-case-name, e.g. export-then-attach>
description: <one line starting "Use when ..."; what triggers this skill>
body:
<numbered markdown steps generalising the procedure to similar future tasks>
No preamble, no code fences, no JSON.`;

export async function draftSkillFromSignal(
  signal: SkillReviewSignal,
  options: DraftSkillOptions
): Promise<SkillDraft | null> {
  const redact = options.redact ?? redactSecretsInText;
  const { exchange } = signal;
  const transcript = [
    exchange.request ? `user asked: ${redact(exchange.request)}` : undefined,
    `assistant answered: ${redact(exchange.priorAnswer)}`,
    `user corrected: ${redact(exchange.correction)}`
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  const messages: readonly ModelMessage[] = [
    { content: DRAFTER_SYSTEM_PROMPT, role: "system" },
    { content: transcript, role: "user" }
  ];
  const request: ModelRequest = {
    maxOutputTokens: options.maxOutputTokens ?? 320,
    messages,
    model: options.model,
    temperature: options.temperature ?? 0.3
  };

  let output: string;
  try {
    const response = await options.modelProvider.generate(request);
    output = (response.output ?? "").trim();
  } catch {
    return null;
  }
  return parseSkillDraft(output);
}

export function parseSkillDraft(raw: string): SkillDraft | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || /^NONE\b/u.test(trimmed)) return null;
  const nameMatch = /^name:\s*(.+)$/imu.exec(trimmed);
  const descMatch = /^description:\s*(.+)$/imu.exec(trimmed);
  const bodyMatch = /^body:\s*\n?([\s\S]+)$/imu.exec(trimmed);
  const name = nameMatch?.[1]?.trim();
  const description = descMatch?.[1]?.trim();
  const body = bodyMatch?.[1]?.trim();
  if (!name || !description || !body) return null;
  return { body, description, name };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @muse/agent-core test -- skill-review`
Expected: PASS (7 tests total in the file).

- [ ] **Step 5: Build the package to confirm exports resolve**

Run: `pnpm --filter @muse/agent-core build`
Expected: tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/skill-review.ts packages/agent-core/test/skill-review.test.ts
git commit -m "feat(agent-core): draft a procedural skill from a correction (NONE for preferences)"
```

---

## Phase 3 — Wiring (`@muse/autoconfigure` + `apps/cli`)

### Task 6: Authored dir resolver + lowest-precedence loader root

**Files:**
- Modify: `packages/autoconfigure/src/provider-paths.ts`
- Modify: `packages/autoconfigure/src/personal-providers.ts:228-238`
- Modify: `packages/autoconfigure/src/index.ts`
- Test: `packages/autoconfigure/test/skills-registry-precedence.test.ts` (create)

- [ ] **Step 1: Add `resolveAuthoredSkillsDir`**

In `packages/autoconfigure/src/provider-paths.ts`, after `resolveUserSkillsDir` (line 160):

```ts
export function resolveAuthoredSkillsDir(env: MuseEnvironment): string {
  return resolveDotMusePath(env, "MUSE_AUTHORED_SKILLS_DIR", "skills/authored");
}
```

Export it from `packages/autoconfigure/src/index.ts` wherever the other `resolve*SkillsDir` are re-exported.

- [ ] **Step 2: Write the failing precedence test**

Create `packages/autoconfigure/test/skills-registry-precedence.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSkillRegistry } from "../src/personal-providers.js";

function writeSkill(root: string, folder: string, name: string, body: string): void {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n\n${body}\n`);
}

describe("buildSkillRegistry — authored is lowest precedence", () => {
  it("a same-named user skill overrides the authored one", async () => {
    const base = mkdtempSync(join(tmpdir(), "muse-prec-"));
    const userDir = join(base, "skills");
    const authoredDir = join(base, "skills", "authored");
    writeSkill(userDir, "dup", "dup", "USER WINS");
    writeSkill(authoredDir, "dup", "dup", "AUTHORED LOSES");
    const env = { MUSE_SKILLS_DIR: userDir, MUSE_AUTHORED_SKILLS_DIR: authoredDir } as never;
    const registry = await buildSkillRegistry(env);
    expect(registry!.get("dup")!.body).toBe("USER WINS");
  });
});
```

Note: `resolveUserSkillsDir` reads `MUSE_SKILLS_DIR`; the user dir here also physically contains `authored/` as a subfolder, but the loader only reads *immediate* sub-directories' `SKILL.md`, so `authored/` (which has no `SKILL.md` directly) is ignored by the user root — only the explicit authored root picks up `authored/dup/SKILL.md`. If this coupling is fragile in practice, point `MUSE_AUTHORED_SKILLS_DIR` outside the user dir in the test.

- [ ] **Step 3: Run, verify it fails**

Run: `pnpm --filter @muse/autoconfigure test -- skills-registry-precedence`
Expected: FAIL — authored root not loaded yet (or wrong precedence).

- [ ] **Step 4: Prepend the authored root in `buildSkillRegistry`**

In `packages/autoconfigure/src/personal-providers.ts`, modify the `roots` array (currently starts at user). Add the import for `resolveAuthoredSkillsDir`, then:

```ts
  const roots: { path: string; source: "user" | "workspace" | "authored" }[] = [
    { path: resolveAuthoredSkillsDir(env), source: "authored" }, // FIRST = lowest precedence
    { path: resolveUserSkillsDir(env), source: "user" }
  ];
  const workspace = resolveWorkspaceSkillsDir(env);
  if (workspace) {
    roots.push({ path: workspace, source: "workspace" });
  }
```

(The loader is "later root wins", so authored first ⇒ user/workspace override it.)

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @muse/autoconfigure test -- skills-registry-precedence`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/autoconfigure/src/provider-paths.ts packages/autoconfigure/src/personal-providers.ts packages/autoconfigure/src/index.ts packages/autoconfigure/test/skills-registry-precedence.test.ts
git commit -m "feat(autoconfigure): load authored skills as lowest-precedence root"
```

---

### Task 7: `authorSkillsFromSession` orchestrator

**Files:**
- Create: `apps/cli/src/chat-author-skills.ts`
- Test: `apps/cli/src/chat-author-skills.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/cli/src/chat-author-skills.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { authorSkillsFromSession } from "./chat-author-skills.js";

const provider = {
  generate: async () => ({
    output: "name: export-then-attach\ndescription: Use when sending a document; PDF first.\nbody:\n1. Convert.\n2. Attach."
  })
};

const corrected = [
  { role: "user", content: "send the report" },
  { role: "assistant", content: "attached the docx" },
  { role: "user", content: "no, that's wrong — always convert to PDF first" }
] as const;

describe("authorSkillsFromSession", () => {
  it("authors a skill from a procedural correction", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-auth-cli-"));
    const res = await authorSkillsFromSession({
      model: "qwen",
      modelProvider: provider as never,
      userId: "u1",
      authoredDir: dir,
      readLines: async () => corrected.map((t) => ({ content: t.content, role: t.role })),
      readBoundaries: async () => [{ userId: "u1" }] as never
    });
    expect(res.status).toBe("authored");
    if (res.status === "authored") expect(res.skills[0]).toContain("export-then-attach");
  });

  it("skips when there is no correction", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-auth-cli-"));
    const res = await authorSkillsFromSession({
      model: "qwen",
      modelProvider: provider as never,
      userId: "u1",
      authoredDir: dir,
      readLines: async () => [{ content: "hi", role: "user" }],
      readBoundaries: async () => [{ userId: "u1" }] as never
    });
    expect(res.status).toBe("skipped");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @muse/cli test -- chat-author-skills`
Expected: FAIL — module not found. (Confirm the filter name with `cat apps/cli/package.json | grep '"name"'`; use that exact name.)

- [ ] **Step 3: Implement the orchestrator (mirrors `chat-distill-corrections.ts`)**

Create `apps/cli/src/chat-author-skills.ts`:

```ts
/**
 * Session-end skill authoring. Reads the just-finished session, detects
 * procedural user corrections, asks the local model to generalise each into
 * a reusable SKILL.md, and writes it execute-gated to the authored skills
 * dir (picked up next session). Mirrors distillSessionCorrections: injectable
 * I/O, fail-soft, typed skip reason. The two are complementary — distillation
 * records a one-line playbook PREFERENCE; this records a multi-step PROCEDURE.
 */

import {
  detectSkillCandidates,
  draftSkillFromSignal,
  extractCurrentSessionTurns,
  type DraftSkillOptions,
  type SessionBoundaryRef,
  type SessionTurnLine
} from "@muse/agent-core";
import { resolveAuthoredSkillsDir } from "@muse/autoconfigure";
import { AuthoredSkillStore } from "@muse/skills";

import { readLastChatHistory, readSessionBoundaries } from "./chat-history.js";

type ModelProviderLike = DraftSkillOptions["modelProvider"];

export interface AuthorSkillsOptions {
  readonly modelProvider: ModelProviderLike;
  readonly model: string;
  readonly userId?: string;
  readonly authoredDir?: string;
  readonly maxCandidates?: number;
  readonly readEnv?: () => NodeJS.ProcessEnv;
  readonly readLines?: () => Promise<readonly SessionTurnLine[]>;
  readonly readBoundaries?: () => Promise<readonly SessionBoundaryRef[]>;
  readonly existingNames?: () => readonly string[];
}

export type AuthorResult =
  | { readonly status: "authored"; readonly skills: readonly string[] }
  | { readonly status: "skipped"; readonly reason: string };

export async function authorSkillsFromSession(options: AuthorSkillsOptions): Promise<AuthorResult> {
  const readLines = options.readLines ?? readLastChatHistory;
  const readBoundaries = options.readBoundaries ?? readSessionBoundaries;
  const env = (options.readEnv ?? (() => process.env))();

  let lines: readonly SessionTurnLine[];
  let boundaries: readonly SessionBoundaryRef[];
  try {
    [lines, boundaries] = await Promise.all([readLines(), readBoundaries()]);
  } catch (cause) {
    return { reason: `history read failed: ${cause instanceof Error ? cause.message : String(cause)}`, status: "skipped" };
  }

  const range = extractCurrentSessionTurns(lines, boundaries);
  if (!range) return { reason: "no current-session range", status: "skipped" };

  const signals = detectSkillCandidates(range.turns, { maxCandidates: options.maxCandidates ?? 2 });
  if (signals.length === 0) return { reason: "no procedural corrections this session", status: "skipped" };

  const dir = options.authoredDir ?? resolveAuthoredSkillsDir(env as Record<string, string | undefined>);
  const store = new AuthoredSkillStore({ dir, ...(options.existingNames ? { existingNames: options.existingNames } : {}) });
  const authored: string[] = [];
  for (const signal of signals) {
    const draft = await draftSkillFromSignal(signal, { model: options.model, modelProvider: options.modelProvider });
    if (!draft) continue;
    try {
      const { action, skill } = await store.writeOrPatch(draft);
      if (action !== "skip") authored.push(`${skill.name} (${action})`);
    } catch {
      // fail-soft per skill
    }
  }

  if (authored.length === 0) return { reason: "nothing new authored (all NONE / duplicates)", status: "skipped" };
  return { skills: authored, status: "authored" };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @muse/cli test -- chat-author-skills`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/chat-author-skills.ts apps/cli/src/chat-author-skills.test.ts
git commit -m "feat(cli): authorSkillsFromSession — session-end procedural skill authoring"
```

---

### Task 8: Wire into end-of-session + manual command

**Files:**
- Modify: `apps/cli/src/chat-ink.ts:1240-1252`
- Modify: `apps/cli/src/commands-skills.ts` (or the file that registers `muse skills *`; if none, add a subcommand where `muse playbook distill` is registered in `commands-playbook.ts` and mirror it)

- [ ] **Step 1: Add the third end-of-session step**

In `apps/cli/src/chat-ink.ts`, inside the `if (assembly.modelProvider && "generate" in assembly.modelProvider) {` block, after the distill block (line ~1251), add:

```ts
    // End-of-session skill authoring: turn a procedural correction into a
    // reusable, execute-gated SKILL.md (picked up next session). Opt-in +
    // fail-soft so a flaky model never blocks exit.
    if (parseBoolean(process.env.MUSE_SKILL_AUTHOR_ENABLED, false)) {
      const { authorSkillsFromSession } = await import("./chat-author-skills.js");
      const result = await authorSkillsFromSession({
        model,
        modelProvider: assembly.modelProvider as Parameters<typeof authorSkillsFromSession>[0]["modelProvider"],
        userId
      }).catch(() => undefined);
      if (result?.status === "authored") {
        for (const name of result.skills) process.stderr.write(`💾 Learned skill: ${name}\n`);
      }
    }
```

- [ ] **Step 2: Add the manual `muse skills author` command**

Find where `muse playbook distill` is registered (`apps/cli/src/commands-playbook.ts:97`). Mirror it for skills — register a `skills` command group (or extend an existing one) with an `author` action that builds the assembly and calls `authorSkillsFromSession`, printing the result. Use the exact same assembly-construction pattern as `commands-playbook.ts` (copy its `buildAssembly`/provider wiring lines verbatim, swapping `distillSessionCorrections` → `authorSkillsFromSession` and printing `result.skills`).

- [ ] **Step 3: Build + narrow test**

Run: `pnpm --filter @muse/cli build && pnpm --filter @muse/cli test -- chat-author-skills`
Expected: tsc 0, tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/chat-ink.ts apps/cli/src/commands-skills.ts apps/cli/src/commands-playbook.ts
git commit -m "feat(cli): wire session-end skill authoring + muse skills author command"
```

---

### Task 9: Cross-package check, eval:tools golden case, smoke:live, ledgers

**Files:**
- Modify: `packages/agent-core` or the eval dataset that `pnpm eval:tools` reads (find it: `grep -rl "eval:tools" package.json scripts apps packages`; the golden dataset is referenced by that script).
- Modify: `docs/goals/CAPABILITIES.md`, `docs/goals/OUTWARD-TARGETS.md`

- [ ] **Step 1: Full build + test**

Run: `pnpm check`
Expected: every workspace builds + tests green.

- [ ] **Step 2: Lint gate**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings. Fix any (prefix unused `_`, `const` over `let`, etc. per code-style.md).

- [ ] **Step 3: Add an eval:tools golden case**

Locate the golden dataset (`grep -rn "eval:tools" package.json` → the script → its dataset file). Add a case: a SKILL.md describing a procedure (e.g. `export-then-attach`) is present; a prompt like "send my quarterly report to my manager" should make the model surface/follow that skill. Add a negative case: an unrelated prompt ("what's the weather") must NOT pull the skill body. Follow the dataset's existing entry shape exactly.

Run: `MUSE_EVAL_REPEAT=3 pnpm eval:tools`
Expected: ≥ threshold (85%). Skips with exit 0 if Ollama is down — if so, tag the CAPABILITIES line `[UNVERIFIED-LIVE]` and make restoring Ollama the next priority.

- [ ] **Step 4: smoke:live end-to-end**

Run: `pnpm smoke:live`
Expected: real local-Qwen round-trip green (the request/response path is unaffected; this confirms no regression). If a dedicated authored-skill live probe is warranted, add it to the smoke:live harness following its existing probe shape.

- [ ] **Step 5: Append the CAPABILITIES.md line + flip the OUTWARD-TARGETS bullet**

Append to `docs/goals/CAPABILITIES.md` (verbatim from the spec):

```
- [Autonomy] Muse authors a reusable SKILL.md from a procedural user correction at session end (fork-and-review, after Hermes) — execute-gated, deduped, capped to ~/.muse/skills/authored/, picked up next session and selected by the local model on a similar request — skill-review.test.ts + authored-skill-store.test.ts + chat-author-skills.test.ts + eval:tools + smoke:live — self-improvement slice
```

In `docs/goals/OUTWARD-TARGETS.md`, flip the relevant Knowledge/Autonomy bullet `[ ]` → `[x]` annotated with the final commit short hash. (Pick the bullet that names self-improvement / learned skills; if none exists, add one under the appropriate axis per the iteration-loop contract.)

- [ ] **Step 6: Final commit**

```bash
git add docs/goals/CAPABILITIES.md docs/goals/OUTWARD-TARGETS.md <eval dataset path>
git commit -m "test: verify autonomous skill authoring end-to-end (eval:tools + smoke:live) + ledger"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** store/execute-gate (T1-3), detect (T4), draft+NONE (T5), loader precedence/no-shadow (T6), orchestrator + memory-vs-skill boundary (T5 prompt + T7), CLI hook + fail-open + manual command (T8), eval:tools + smoke:live + falsifiable outward test + ledgers (T9). complex-success/curator/live-registration explicitly out of scope.
- **Placeholder scan:** every code step shows complete code; the only "find the file" steps (eval dataset, manual-command registration) give the exact `grep` to locate it and the pattern to copy — unavoidable because those are repo-specific registration points.
- **Type consistency:** `SkillDraft` defined identically in skills (T1) and agent-core (T5) — they are structurally identical; the CLI passes the agent-core draft straight to `store.writeOrPatch` (both `{name,description,body}`). `writeOrPatch` returns `{action,skill}` used consistently in T7. `detectSkillCandidates(turns, {maxCandidates})` and `draftSkillFromSignal(signal, {model,modelProvider})` signatures match between definition and callers.

## Known follow-ups (not this plan)

- Slice 2: complex-success → skill (needs tool-iteration count from run-history + "no following correction").
- Slice 3 / option C: curator (consolidate/pin/archive of authored skills on idle).
- Possibly hoist `strategyTextSimilarity` to `@muse/shared` and inject it into the store for one canonical similarity fn.
