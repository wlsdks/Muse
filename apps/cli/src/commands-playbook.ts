/**
 * `muse playbook` — the user entry point to the learned-strategy playbook
 * (ACE, arXiv 2510.04618). Local mode over the shared `~/.muse/playbook.json`,
 * the same file `buildPlaybookProvider` adapts into the agent runtime, so a
 * CLI-added strategy surfaces as `[Learned Strategies]` on the next agent run
 * with no API server required.
 */

import { randomUUID } from "node:crypto";

import { createMuseRuntimeAssembly, resolvePlaybookFile } from "@muse/autoconfigure";
import { queryPlaybook, recordPlaybookStrategy, removePlaybookStrategy } from "@muse/mcp";
import type { Command } from "commander";

import { distillSessionCorrections } from "./chat-distill-corrections.js";
import type { ProgramIO } from "./program.js";
import { resolveDefaultUserKey } from "./user-id.js";

function playbookFile(): string {
  return resolvePlaybookFile(process.env as Record<string, string | undefined>);
}

export function registerPlaybookCommands(program: Command, io: ProgramIO): void {
  const playbook = program.command("playbook").description("Learned strategies the agent applies from past feedback (ACE)");

  playbook
    .command("add")
    .description("Record a strategy, e.g. `muse playbook add \"keep work emails under 4 sentences\" --tag email`")
    .argument("<text...>", "The strategy (joined by spaces)")
    .option("--tag <tag>", "Optional task-class tag (e.g. email, scheduling)")
    .option("--user <id>", "User identity (default $MUSE_USER_ID or $USER)")
    .action(async (parts: string[], options: { readonly tag?: string; readonly user?: string }) => {
      const text = parts.join(" ").trim();
      if (text.length === 0) {
        throw new Error("playbook add requires a non-empty strategy");
      }
      const userId = resolveDefaultUserKey({ override: options.user });
      await recordPlaybookStrategy(playbookFile(), {
        id: `pb_${randomUUID()}`,
        userId,
        text,
        ...(options.tag && options.tag.trim().length > 0 ? { tag: options.tag.trim() } : {}),
        createdAt: new Date().toISOString()
      });
      io.stdout(`Recorded strategy (user=${userId})\n`);
    });

  playbook
    .command("list")
    .description("List learned strategies")
    .option("--user <id>", "User identity (default $MUSE_USER_ID or $USER)")
    .option("--json", "Print the raw entries")
    .action(async (options: { readonly user?: string; readonly json?: boolean }) => {
      const userId = resolveDefaultUserKey({ override: options.user });
      const entries = await queryPlaybook(playbookFile(), userId);
      if (options.json) {
        io.stdout(`${JSON.stringify(entries, null, 2)}\n`);
        return;
      }
      if (entries.length === 0) {
        io.stdout("(no learned strategies yet)\n");
        return;
      }
      for (const e of entries) {
        io.stdout(`  [${e.id.slice(0, 12)}]${e.tag ? ` (${e.tag})` : ""} ${e.text}\n`);
      }
    });

  playbook
    .command("remove")
    .description("Remove a strategy by id (prefix from `playbook list`)")
    .argument("<id>", "Strategy id")
    .action(async (id: string) => {
      const all = await queryPlaybook(playbookFile());
      const match = all.find((e) => e.id === id) ?? all.find((e) => e.id.startsWith(id));
      if (!match) {
        io.stdout(`(no strategy matches "${id}")\n`);
        return;
      }
      await removePlaybookStrategy(playbookFile(), match.id);
      io.stdout(`Removed strategy [${match.id.slice(0, 12)}]\n`);
    });

  playbook
    .command("distill")
    .description("Learn strategies from corrections you made in your last chat session (ReasoningBank)")
    .option("--user <id>", "User identity (default $MUSE_USER_ID or $USER)")
    .option("--model <id>", "Model to distill with (default the configured model)")
    .action(async (options: { readonly user?: string; readonly model?: string }) => {
      const userId = resolveDefaultUserKey({ override: options.user });
      const assembly = createMuseRuntimeAssembly();
      const model = options.model ?? assembly.defaultModel;
      if (!assembly.modelProvider || !model) {
        io.stdout("distill needs a model provider — run `muse setup` or set MUSE_MODEL\n");
        return;
      }
      const result = await distillSessionCorrections({
        model,
        modelProvider: assembly.modelProvider as Parameters<typeof distillSessionCorrections>[0]["modelProvider"],
        userId
      });
      if (result.status === "recorded") {
        io.stdout(`Learned ${result.strategies.length.toString()} strateg${result.strategies.length === 1 ? "y" : "ies"} from your last session:\n`);
        for (const strategy of result.strategies) {
          io.stdout(`  - ${strategy.text}${strategy.tag ? ` (${strategy.tag})` : ""}\n`);
        }
        return;
      }
      io.stdout(`(nothing learned: ${result.reason})\n`);
    });
}
