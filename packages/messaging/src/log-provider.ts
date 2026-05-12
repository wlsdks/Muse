/**
 * `LogMessagingProvider` — credential-free, local-only `MessagingProvider`
 * that appends every outbound message to a log file. Useful when:
 *
 *   - dogfooding the proactive daemon end-to-end on a machine where
 *     the operator has no Telegram / Slack / Discord set up,
 *   - debugging a messaging flow without spending real tokens,
 *   - shipping Muse as a self-contained kit where the only "channel"
 *     is the local filesystem the user already trusts.
 *
 * The provider IS the channel — it doesn't fan out anywhere else.
 * Pair it with a `tail -f ~/.muse/notifications.log` for the JARVIS
 * "popped up unbidden" feel without setting up a chat bot.
 *
 * Inbound is intentionally NOT implemented; this is a one-way
 * delivery surface. Callers that need inbound should use a real
 * provider.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type {
  MessagingProvider,
  MessagingProviderInfo,
  OutboundMessage,
  OutboundReceipt
} from "./types.js";
import { validateOutboundMessage } from "./validate.js";

export interface LogMessagingProviderOptions {
  /**
   * Provider id surfaced via `describe()`. Default `log` so callers
   * can wire `--provider log` without ceremony.
   */
  readonly id?: string;
  /**
   * Absolute path of the append-only log file. Defaults to
   * `~/.muse/notifications.log`. Parent directory is created on
   * demand; mode 0o600 so credentials in payload (rare for proactive
   * but cheap insurance) don't leak.
   */
  readonly file?: string;
  /** Injectable clock for tests. Default `() => new Date()`. */
  readonly now?: () => Date;
}

function defaultLogPath(): string {
  return join(homedir(), ".muse", "notifications.log");
}

export class LogMessagingProvider implements MessagingProvider {
  readonly id: string;

  private readonly file: string;
  private readonly now: () => Date;

  constructor(options: LogMessagingProviderOptions = {}) {
    this.id = options.id ?? "log";
    this.file = options.file ?? defaultLogPath();
    this.now = options.now ?? (() => new Date());
  }

  describe(): MessagingProviderInfo {
    return {
      description:
        `Append-only local log file (${this.file}). No external credentials. ` +
        "Useful for credential-free proactive end-to-end dogfood; pair with `tail -f` to see notices.",
      displayName: "Local log",
      id: this.id,
      local: true
    };
  }

  async send(message: OutboundMessage): Promise<OutboundReceipt> {
    validateOutboundMessage(message);
    const ts = this.now().toISOString();
    const line = `[${ts}] (${message.destination}) ${message.text}\n`;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, line, { flag: "a", mode: 0o600 });
    return {
      destination: message.destination,
      messageId: `log-${ts}`,
      providerId: this.id,
      raw: { file: this.file, line, ts }
    };
  }
}
