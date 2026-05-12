# AI agent capability audit

Snapshot of what Muse covers as a personal AI agent vs the typical
"general AI agent" surface. Goal: identify the highest-leverage gaps
to close next, ordered by ROI for the JARVIS-class personal-assistant
mission and the constraint "open-source + free + Qwen-local + no
extra cost".

Updated: 2026-05-12 (session that shipped persona / proactive /
voice / pattern / multi-persona / trust / brief / webhook).

## Strong / shipped

| Capability | Status | Where |
| --- | --- | --- |
| Provider-neutral LLM core | ✅ | `packages/model` adapters (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio, OpenAI-compat) |
| Tool calling + registry | ✅ | `packages/tools`, `agent-core` |
| Plan-Execute (multi-step) | ✅ | `agent-core/plan-execute-loop.ts` |
| ReAct loop with retry | ✅ | `agent-core/model-loop.ts` |
| Response cache | ✅ | `packages/cache` |
| Token / budget tracking | ✅ | `MonthlyBudgetTracker`, `TokenUsageSink` |
| Conversation summary store | ✅ | `packages/memory` + REPL auto-compaction |
| Persistent user-memory | ✅ | `FileUserMemoryStore` + REPL persona injection |
| Auto-extract facts from chat | ✅ | `memory-auto-extract` + REPL fire-and-forget |
| Multi-persona slots | ✅ | `--persona work/home` |
| Tool trust list | ✅ | `muse trust` + REPL `metadata.forbiddenToolNames` |
| Proactive surfacing | ✅ | calendar + tasks → notice, with persona, quiet-hours, two-way |
| External signal triggers | ✅ | `muse watch-folder` (file) + `muse webhook serve` (HTTP) |
| Pattern learning (active hours) | ✅ | `muse routine` + `routine_active_hours` fact |
| Voice STT (local) | ✅ | `WhisperCppSttProvider`, whisper-cli auto-detect |
| Voice TTS (local) | ✅ | `PiperTtsProvider`, `brief --speak`, `proactive watch --speak` |
| MCP bridge (stdio) | ✅ | `packages/mcp/bin/muse-mcp-stdio.mjs` (Codex, Claude Desktop) |
| Multi-agent orchestration | ✅ | `packages/multi-agent` (SupervisorAgent + bus) |
| Cron / scheduler | ✅ | `packages/scheduler` (DynamicScheduler) |
| Token / latency observability | ✅ | `packages/observability` |
| Notes / tasks / calendar tools | ✅ | personal trio in `packages/mcp` |
| Episodic recall | ✅ | `agent-core/episodic-recall` (substring against conversation summaries) |

## Gaps — priority ordered

### P1 — meaningful for daily JARVIS, low/medium effort

| Gap | Why it matters | Sketch |
| --- | --- | --- |
| **Approval pipeline** | Trust list hard-blocks; no "ask user, then proceed" gate for ambiguous calls. JARVIS asks before launching the suit. | New `ApprovalStore` keyed by runId+toolCallId. REPL/web prompts the user; agent waits. Could be a slash command `/approve` / `/deny`. |
| **Vector RAG over notes** | Notes search is substring-only — misses paraphrases. JARVIS "what did I say about Q3?" needs embeddings. | Embed `~/.muse/notes/*.md` chunks with a local embeddings model (e.g. `nomic-embed-text` via Ollama). On-disk sqlite-vec or a flat JSON file for low-vol. Tool: `muse.notes.semantic_search`. |
| **Background long-running tasks** | Scheduler is cron; no "run this for an hour and tell me when done". Real agent should kick off a long-running job. | `muse task run --background <prompt>` writes a runId to `~/.muse/jobs/<id>.jsonl`; daemon process appends progress; `muse task status <id>` reads. |
| **`muse listen` actual mic dogfood** | Voice infra is verified (525 ms TTS+STT roundtrip via providers). End-to-end with mic capture requires interactive owner + permission. | User runs `muse listen --wake "hey muse"` manually; document in docs/setup-local-llm.md once done. |
| **Per-shell persona auto-load** | `--persona work` every time is friction. Shell env `MUSE_PERSONA=work` should auto-apply. | Cheap — REPL already reads `MUSE_PERSONA` (would need a 2-line read). |

### P2 — adds real agent depth, more design needed

| Gap | Why it matters | Sketch |
| --- | --- | --- |
| **Vision / image input** | "Look at this diagram" / "what's in this screenshot" — JARVIS reads holograms. Local Qwen 3.5-Omni has vision but loading it is heavy. | Adapter accepting `imageBase64` in `ModelRequest`; route through `qwen3.5:omni` or cloud Gemini per cost setting. |
| **Self-evaluation / critique** | `packages/eval` exists but no wired self-critique loop. Agent could grade its own answer and retry once if low score. | Hook in agent-runtime: after `afterComplete`, run a 1-call self-critic ("rate 1-5; if <3 explain"). Retry only if score low + budget allows. |
| **Action automation beyond MCP** | Tools today are read-mostly + tasks/calendar/notes write. Real JARVIS controls suits, lights, etc. | Already has tool framework; gap is *adapter inventory* (Apple HomeKit, Shortcuts, AppleScript wrappers). Each is ~1 tool definition + thin shell-out. |
| **Trust-list runtime auto-approve** | `muse trust grant <tool>` currently only hard-blocks via `forbiddenToolNames`. Trusted tools don't yet bypass any future approval gate. | Pairs with approval pipeline above — when trusted, skip the gate. |
| **Routine → proactive priority** | Quiet hours land but no "urgent overrides quiet". Task with `urgent: true` should ring at 3am. | Task schema gains `urgent?: boolean`; quiet-hours gate skips when any imminent item is urgent. |

### P3 — nice-to-have, defer until P1/P2 proven

| Gap | Why deferred |
| --- | --- |
| Multi-modal output (TTS voice cloning, image gen) | Heavy, not core to "personal assistant" |
| Distributed agent (multi-machine) | One-user-one-machine is the MVP shape |
| Federated learning / fine-tune | Cost-wise out of bounds |
| Voice-emotion modulation | Piper is monotone but readable |

## Constraints reaffirmed

- **Open-source preferred** — every dep above (whisper.cpp MIT,
  piper MIT, sox GPL-CLI, nomic-embed-text Apache-2.0, sqlite-vec
  Apache-2.0) clears the bar.
- **Cost-free beyond LLM** — local everything; cloud LLM is BYOK
  and per-call.
- **Qwen local** — embeddings can run alongside the chat model
  through the same Ollama daemon (`ollama pull nomic-embed-text`).

## Suggested next iteration

Pick P1 in this order:

1. **Per-shell persona auto-load** (5 min — env var pickup).
2. **Approval pipeline** (1–2 h — needs schema + slash command +
   agent-runtime hook). Lands the missing "yes/no" surface.
3. **Vector RAG over notes** (2–3 h — embed + flat index + tool).
   Unlocks "what did I say about X" via semantic search.
4. **Background tasks** (3–4 h — job runner + status surface).
   Lets Muse work in the background like a real assistant.

Together this is one focused session of work that closes the
biggest remaining gap between "very polished personal AI" and
"actual JARVIS-class agent".
