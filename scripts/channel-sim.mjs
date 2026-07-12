/**
 * channel-sim — a CLI driver that lets an external "simulated user" (a
 * persona agent, a redteam harness, a long-horizon soak driver, …) converse
 * with the REAL channel-reply pipeline: pairing → approval-reply →
 * channel-veto → casual fast-path → chat fast-path (S3) → delegation ack
 * (S2) → full agent run, exactly as `apps/api/src/inbound-agent-run.ts`
 * wires it for Telegram/Matrix in production. One invocation = one inbound
 * message; state (thread history, channel-owner pairing, pending
 * approvals, proactive-trust ledger, user-memory) persists on disk under
 * `--sandbox <dir>` across invocations, so a multi-turn session is a
 * sequence of `channel-sim` calls.
 *
 * WHAT'S REAL vs STUBBED (read this before trusting a route label):
 *   REAL   — `createMuseRuntimeAssembly` (the exact composition root
 *            `apps/api`'s server boots), so `agentRuntime`, `modelProvider`
 *            (a real Ollama adapter), `userMemoryStore` (file-backed,
 *            auto-extract hook wired in), the grounding/citation gate, the
 *            honest-action gate, tool registry, and every deterministic
 *            gate in `createInboundAgentRun` (pairing/TOFU, approval-reply,
 *            channel-veto, casual fast-path, chat fast-path S3, delegation
 *            ack S2) are the PRODUCTION code, unmodified, loaded from
 *            built `dist/`.
 *   REAL   — the thread store (`createThreadedInboundRunner` +
 *            `@muse/messaging`'s file-backed thread sidecar) and every
 *            other sidecar the gates touch (channel-owner pairing,
 *            pending-approvals, proactive-trust ledger) — all real,
 *            file-backed, scoped under the sandbox via `HOME` override.
 *   STUBBED — the messaging PROVIDER: a capturing in-memory fake (mirrors
 *            the `capturingProvider` test-double pattern used across
 *            apps/api/test/*-tick.test.ts) records every outbound send
 *            instead of hitting a real Telegram/Matrix API. This is the
 *            one deliberate substitution — there is no real chat platform
 *            in a simulation driver.
 *   STUBBED — the polling daemon wrapper (`respondToInbound` /
 *            `startInboundReplyTick`, which read an inbox file, dedupe via
 *            a reply cursor, and re-fire a typing indicator). This driver
 *            calls the SAME `createThreadedInboundRunner(...).run()` the
 *            daemon calls per message directly, once per invocation
 *            (there is exactly one synthesized inbound message per
 *            process, so cursor/dedup bookkeeping is moot) — then
 *            replicates the daemon's own "trim, send only if non-empty"
 *            final-delivery step by hand. Everything downstream of that
 *            call is the untouched production gate chain.
 *
 * Usage:
 *   node scripts/channel-sim.mjs --sandbox <dir> --message "<text>" [--reset] [--user <id>]
 *
 * `--reset` wipes the sandbox before processing (combine with `--message`
 * to start a fresh session's first turn in one call, or omit `--message`
 * to just reset). `--user` overrides the simulated sender id (default
 * "user") — set it to a different id to simulate a second, unpaired
 * "stranger" chat against the same sandbox/provider.
 *
 * Prints ONE JSON result to stdout:
 *   { replies: [{text, kind: "ack"|"final", atMs}], elapsedMs, route, threadLen }
 * `kind: "ack"` covers every send that happens BEFORE the final reply —
 * that is normally the S2 delegation-ack composer's output, but
 * `createChannelApprovalGate` (packages/messaging) also sends its own
 * refusal notice mid-run the moment the model attempts a risky tool call,
 * through the SAME registry, before the final reply exists. The driver
 * can't cleanly tell these two apart without instrumenting production
 * code it must not touch, so both land under `kind: "ack"` — read the
 * `text` to tell a delegation ack from a tool-refusal notice.
 *
 * LOCAL OLLAMA ONLY — forces MUSE_LOCAL_ONLY=true so the model is always
 * the local default (ollama/gemma4:12b), never a stray cloud key in the
 * ambient shell env. Exits 1 with a message if Ollama is unreachable.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { classifyRoute } from "./channel-sim-route.mjs";

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/u, "");

function parseArgs(argv) {
  const out = { help: false, message: undefined, reset: false, sandbox: undefined, user: "user" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sandbox") {
      out.sandbox = argv[(i += 1)];
    } else if (arg === "--message") {
      out.message = argv[(i += 1)];
    } else if (arg === "--reset") {
      out.reset = true;
    } else if (arg === "--user") {
      out.user = argv[(i += 1)];
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`channel-sim: unknown argument '${arg}'`);
    }
  }
  return out;
}

async function ollamaReachable() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

class CaptureMessagingProvider {
  constructor(id) {
    this.id = id;
    this.sent = [];
  }

  describe() {
    return {
      description: "In-memory capture provider for channel-sim.mjs — records every outbound send, no real delivery.",
      displayName: "channel-sim capture",
      id: this.id,
      local: true
    };
  }

  async send(message) {
    const atMs = Date.now();
    const entry = { atMs, destination: message.destination, text: message.text };
    this.sent.push(entry);
    return { destination: message.destination, messageId: `sim-${String(this.sent.length)}`, providerId: this.id };
  }
}

const USAGE = 'Usage: node scripts/channel-sim.mjs --sandbox <dir> --message "<text>" [--reset] [--user <id>]';

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.sandbox) {
    console.log(USAGE);
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const sandboxDir = path.resolve(args.sandbox);
  const homeDir = path.join(sandboxDir, "home");

  if (args.reset) {
    await fs.rm(sandboxDir, { force: true, recursive: true });
  }
  await fs.mkdir(homeDir, { recursive: true });

  if (!args.message) {
    console.log(JSON.stringify({ reset: args.reset, sandbox: sandboxDir }));
    return;
  }

  // Sandbox every `~/.muse/*` sidecar resolver under this process's own
  // HOME so nothing here can ever touch the real ~/.muse. Several
  // resolvers (FileUserMemoryStore, LogMessagingProvider, channel-owner
  // store, the proactive-trust file) fall back to bare `os.homedir()`
  // rather than an explicit env override, so this is the one override
  // that actually reaches all of them.
  process.env.HOME = homeDir;
  process.env.MUSE_LOCAL_ONLY = "true";
  // An ambient MUSE_MODEL/MUSE_DEFAULT_MODEL would otherwise win over the
  // local-only default — clear it so the model is always the local one.
  delete process.env.MUSE_MODEL;
  delete process.env.MUSE_DEFAULT_MODEL;

  if (!(await ollamaReachable())) {
    console.error(`channel-sim: Ollama unreachable at ${OLLAMA_BASE} — start it and retry.`);
    process.exitCode = 1;
    return;
  }

  const [
    { createMuseRuntimeAssembly },
    { createThreadedInboundRunner, isApprovalReply, MessagingProviderRegistry, readThread },
    { casualResponseFor, classifyCasualPrompt, classifyChannelIntent, containsHangul },
    { isVetoUtterance },
    { createInboundAgentRun },
    { createComposeAck },
    { createComposeChatReply }
  ] = await Promise.all([
    import("../packages/autoconfigure/dist/index.js"),
    import("../packages/messaging/dist/index.js"),
    import("../packages/agent-core/dist/index.js"),
    import("../apps/api/dist/inbound-veto-handler.js"),
    import("../apps/api/dist/inbound-agent-run.js"),
    import("../apps/api/dist/inbound-ack.js"),
    import("../apps/api/dist/inbound-chat-reply.js")
  ]);

  const providerId = "sim";
  const source = args.user;
  const capture = new CaptureMessagingProvider(providerId);
  const registry = new MessagingProviderRegistry([capture]);
  const env = process.env;

  const assembly = createMuseRuntimeAssembly({ env });
  if (!assembly.agentRuntime || !assembly.modelProvider) {
    console.error("channel-sim: no local model provider configured under MUSE_LOCAL_ONLY — check Ollama / OLLAMA_BASE_URL.");
    process.exitCode = 1;
    return;
  }

  const model = assembly.defaultModel ?? "ollama/gemma4:12b";
  const run = createInboundAgentRun({
    agentRuntime: assembly.agentRuntime,
    composeAck: createComposeAck({ model, modelProvider: assembly.modelProvider }),
    composeChatReply: createComposeChatReply({ model, modelProvider: assembly.modelProvider }),
    env,
    model,
    registry,
    userMemoryStore: assembly.userMemoryStore
  });
  const threadFile = path.join(sandboxDir, "threads.json");
  const runner = createThreadedInboundRunner({ run, threadFile });

  const startMs = Date.now();
  const sentBeforeRun = capture.sent.length;
  let rawReply;
  try {
    rawReply = (
      await runner.run({
        notify: async (text) => {
          await registry.send(providerId, { destination: source, text });
        },
        providerId,
        scope: "direct",
        source,
        text: args.message
      })
    ).trim();
  } catch (cause) {
    console.error(`channel-sim: turn failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exitCode = 1;
    return;
  }
  const ackEntries = capture.sent.slice(sentBeforeRun);
  let finalEntry;
  if (rawReply.length > 0) {
    // Mirrors respondToInbound's own contract: only a NON-EMPTY reply is
    // actually delivered to the channel.
    await registry.send(providerId, { destination: source, text: rawReply });
    finalEntry = capture.sent[capture.sent.length - 1];
  }
  const elapsedMs = Date.now() - startMs;

  const replies = [
    ...ackEntries.map((entry) => ({ atMs: entry.atMs, kind: "ack", text: entry.text })),
    ...(finalEntry ? [{ atMs: finalEntry.atMs, kind: "final", text: finalEntry.text }] : [])
  ];

  const casualKind = classifyCasualPrompt(args.message);
  const casualMatch = casualKind !== null && finalEntry?.text === casualResponseFor(casualKind, containsHangul(args.message));
  const channelIntentIsChat = classifyChannelIntent(args.message) === "chat";
  const isVeto = isVetoUtterance(args.message);
  const isApproval = isApprovalReply(args.message);
  const route = classifyRoute({ casualMatch, channelIntentIsChat, isApproval, isVeto, replies });

  const threadLen = (await readThread(threadFile, `${providerId}:${source}`)).length;

  console.log(JSON.stringify({ elapsedMs, replies, route, threadLen }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
  process.exit(process.exitCode ?? 0);
}
