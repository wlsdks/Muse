/**
 * `muse approvals` — the live worklist of state-changing actions Muse
 * attempted over a channel (Telegram/etc.) and the fail-closed gate
 * refused, awaiting your approval. Distinct from `muse actions`: that's
 * the immutable audit log of every action ever attempted; this shows
 * only the un-expired, un-actioned items (with the structured tool +
 * args), and lets you dismiss stale ones. Local read over the shared
 * `~/.muse/pending-approvals.json` the API server's inbound gate writes.
 */

import { resolvePendingApprovalsFile } from "@muse/autoconfigure";
import { clearPendingApproval, listPendingApprovals, type PendingApproval } from "@muse/messaging";
import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

function pendingFile(): string {
  return resolvePendingApprovalsFile(process.env as Record<string, string | undefined>);
}

function formatPending(entry: PendingApproval): string {
  const who = entry.userId ?? `${entry.providerId}:${entry.source}`;
  return `${entry.id}  ${who}  ${entry.tool} — ${entry.draft} (expires ${entry.expiresAt})`;
}

export function registerApprovalsCommands(program: Command, io: ProgramIO): void {
  const approvals = program
    .command("approvals")
    .description("Review/dismiss channel actions awaiting your approval (the live pending worklist)");

  approvals
    .command("list", { isDefault: true })
    .description("List un-expired pending channel approvals, newest first")
    .option("--json", "Print the raw payload instead of the formatted list")
    .action(async (options: { readonly json?: boolean }) => {
      const pending = await listPendingApprovals(pendingFile());
      if (options.json) {
        io.stdout(`${JSON.stringify({ pending, total: pending.length }, null, 2)}\n`);
        return;
      }
      if (pending.length === 0) {
        io.stdout("No pending approvals.\n");
        return;
      }
      for (const entry of pending) {
        io.stdout(`${formatPending(entry)}\n`);
      }
    });

  approvals
    .command("clear")
    .description("Dismiss a pending approval by id (also prunes expired entries)")
    .argument("<id>", "Pending approval id (from `muse approvals list`)")
    .action(async (id: string, _options, command: Command) => {
      const removed = await clearPendingApproval(pendingFile(), id.trim());
      if (removed) {
        io.stdout(`Dismissed pending approval ${id.trim()}.\n`);
        return;
      }
      io.stderr(`No pending approval with id '${id.trim()}'.\n`);
      command.error("approvals clear failed", { exitCode: 1 });
    });
}
