/**
 * `muse inbox` — read-only inbox triage via the Gmail REST API.
 * Reads the most-recent inbox messages (no SDK, no new dep) and prints
 * a triage summary + listing. READ ONLY — no outbound-safety gate.
 *
 * The access token comes from `MUSE_GMAIL_TOKEN` (a Gmail OAuth2
 * access token with gmail.readonly scope). A guided `muse auth gmail`
 * flow is a future slice; for now the user supplies the token.
 */

import { GmailEmailProvider, summarizeInbox, type EmailProvider } from "@muse/mcp";
import type { Command } from "commander";

import { parseBoundedInt } from "./commands-ask.js";
import type { ProgramIO } from "./program.js";

interface InboxOptions {
  readonly limit?: string;
  readonly json?: boolean;
}

export function registerInboxCommand(program: Command, io: ProgramIO, provider?: EmailProvider): void {
  program
    .command("inbox")
    .description("Read + triage your Gmail inbox (read-only; needs MUSE_GMAIL_TOKEN)")
    .option("--limit <n>", "How many recent messages to read (1-50, default 10)")
    .option("--json", "Emit the message summaries as JSON")
    .action(async (options: InboxOptions) => {
      const limit = parseBoundedInt(options.limit, "--limit", 1, 50, 10);
      let email = provider;
      if (!email) {
        const token = process.env.MUSE_GMAIL_TOKEN?.trim();
        if (!token) {
          io.stderr("muse inbox: set MUSE_GMAIL_TOKEN to a Gmail OAuth2 access token (gmail.readonly scope).\n");
          process.exitCode = 1;
          return;
        }
        email = new GmailEmailProvider(token, io.fetch ?? globalThis.fetch);
      }
      let messages;
      try {
        messages = await email.listRecent(limit);
      } catch (cause) {
        io.stderr(`muse inbox: ${cause instanceof Error ? cause.message : String(cause)}\n`);
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        io.stdout(`${JSON.stringify(messages, null, 2)}\n`);
        return;
      }
      io.stdout(`${summarizeInbox(messages)}\n`);
      for (const message of messages) {
        const mark = message.unread ? "●" : " ";
        io.stdout(`${mark} ${message.from || "(unknown)"} — ${message.subject || "(no subject)"}\n`);
      }
    });
}
