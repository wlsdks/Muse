# Capability-Parity Backlog — reaching hermes / openclaw level

> Generated 2026-06-23 by a 12-domain analysis workflow over the cloned reference
> sources (`/Users/jinan/ai/openclaw` — TS/JS; `/Users/jinan/ai/hermes-agent` —
> Python) cross-checked against Muse's own packages.
>
> **221 developable work items** across 12 capability domains.
>
> **Reference-only.** Every item cites a concrete competitor mechanism but proposes
> **Muse's own** implementation that respects the non-negotiables: local-first
> (Ollama default, `MUSE_LOCAL_ONLY` on, cloud egress fail-close), the grounding /
> citation floor (fabrication = 0), model-agnostic `agent-core`, draft-first
> fail-close outbound, banking out of scope, deterministic guards. No item makes a
> cloud vendor the runtime owner or relies on a bigger model.
>
> **How to read:** `gap` = `missing` (Muse has nothing) or `partial` (exists but
> weaker). `priority` ★1–5 = leverage toward parity. `effort` S/M/L. Pick work via
> the `improve-muse` skill; build per `harness/host/dev-loop.md` §3.
>
> **Caveat:** competitor file paths and mechanisms were read from source and are
> reliable, but any quantitative benefit figures in a `Value` line (e.g. "8–15%
> improvement") are **analyst-asserted, not measured** — treat them as hypotheses to
> prove with the item's own `Verify` gate, never as established facts.

## Legend

- **★★★★★ / ★★★★** — highest-leverage parity gaps; do these first.
- **gap: missing** — a capability the reference agents have and Muse lacks entirely.
- **gap: partial** — Muse has a weaker/narrower version; the item is the hardening delta.
- Each item names the **Muse package/file** it lands in and a **verify** gate.


## Priority index (★★★★★ and ★★★★ first)


### ★★★★★ (21)

- `LLM-1` — Implement plain-text tool-call promotion from leaked text responses
- `CTX-1` — Automatic context-reference expansion with @ syntax
- `CTX-2` — Preflight compression check before API call
- `MEM-1` — Implement local-model REM/Light sleep background dreaming scheduler with short-term promotion
- `MEM-2` — Implement memory flush protocol (pre-compaction write gate with append-only constraint)
- `SKL-1` — Skill installation and marketplace: basic hub discovery (search multiple skill sources)
- `SKL-2` — Skill validation and risk scanning at author/install time (no prompt-injection)
- `TSF-1` — Implement deterministic URL secret redaction in tool results and logs
- `TSF-2` — Implement tool-loop guardrail with repeated failure detection
- `TSF-3` — Implement redaction of secrets in tool output and logs (prefix-based + patterns)
- `REL-1` — Implement API error classifier with priority-ordered taxonomy
- `AUT-1` — Managed-cron contract + external scheduler integration (at-most-once, dedup, re-arm semantics)
- `AUT-2` — Workflow serialization: save multi-turn plan + branching as replayable workflow (for team/community sharing)
- `ORC-1` — Implement supervisor agent gateway for distributed endpoint management
- `CHN-1` — Implement generic webhook receiver for inbound integrations
- `CHN-2` — Implement thread-aware message routing with origin tracking
- `MED-1` — STT provider registry + dispatch abstraction
- `MED-2` — Document text + image extraction (PDF-first)
- `WEB-1` — Implement web search provider ABC + registry
- `WEB-2` — Implement browser provider ABC + registry for cloud browsers
- `UX-1` — Context-aware progressive onboarding hints (first-time tips)

### ★★★★ (45)

- `LLM-2` — Implement thinking-level budgeting (token budgets per reasoning level)
- `LLM-3` — Implement Anthropic cache-retention and session-affinity headers
- `LLM-4` — Implement message-level tool-call deduplication by hash
- `CTX-3` — Multi-pass conversation compression with iterative summary refinement
- `CTX-4` — Configurable compression thresholds (working budget vs hard limit)
- `CTX-5` — Head/tail message protection with token-budget tail mode
- `CTX-6` — Image/video content token estimation and selective pruning
- `CTX-7` — System-prompt three-tier assembly (stable/context/volatile)
- `CTX-8` — Provider-specific context-length resolution with fallback chain
- `MEM-3` — Build deterministic curation loop: auto-archive stale episodic memories + mark for consolidation review
- `MEM-4` — Implement backup/snapshot system for episodic & knowledge stores with rollback capability
- `SKL-3` — Skill bundles (load N skills under one /command)
- `SKL-4` — Skill installation: 'muse skills install' from GitHub/registry with conflict resolution
- `TSF-4` — Implement SSRF IP address blocking for network policy
- `TSF-5` — Add homoglyph and zero-width evasion defense to injection patterns
- `TSF-6` — Implement file-safety read denylist for .env and credential stores
- `TSF-7` — Implement tool-result mutation verification (write_file / patch success confirmation)
- `TSF-8` — Implement concurrent tool execution with interrupt handling
- `REL-2` — Add jittered exponential backoff with concurrent session decorrelation
- `REL-3` — Per-turn recovery state tracker with one-shot guards
- `AUT-3` — Session lifecycle + expiry management (idle reset, daily reset, suspension recovery)
- `AUT-4` — Cron job run-history + failure tracking (persisted execution log, run duration, error classification, backoff counters)
- `AUT-5` — Model switch + version mismatch detection in cron / background jobs (fallback chain, fast mode, auth profile override)
- `AUT-6` — Consolidation curator loop: idle-triggered skill merge (pinned skills never touched, archive old versions, test consolidated skills)
- `ORC-2` — Add turn-level session context and source metadata tracking
- `ORC-3` — Implement typed event streaming dispatcher with adapter rendering hooks
- `ORC-4` — Add turn interruption and steering for active agent runs
- `CHN-3` — Add delivery-routing logic to support multi-platform delivery targets
- `CHN-4` — Add approval-gate enforcement for outbound delivery targets
- `MED-3` — TTS persona registry + multi-voice fallback chain
- `MED-4` — TTS streaming synthesis surface
- `MED-5` — Structured document metadata extraction
- `MED-6` — Image generation provider registry (local + remote dispatch)
- `MED-7` — Vision input grounding verification (image OCR confidence gate)
- `WEB-3` — Implement Firecrawl web search + extract provider
- `WEB-4` — Implement Brave Search provider (free tier, local-compatible)
- `WEB-5` — Implement SearXNG local provider with aggregate scoring
- `WEB-6` — Add web extract capability to built-in muse.web server
- `WEB-7` — Implement provider capability matrix for tool routing
- `UX-2` — Tool call preview + verb+detail formatting (skin-aware display)
- `UX-3` — Stream diagnostics + retry logging (per-attempt counters, upstream headers)
- `UX-4` — Doctor command with --lint (read-only structured findings, JSON output)
- `UX-5` — Busy-input mode hints + /verbose cycling for tool progress
- `UX-6` — Error type classification + actionable remediation (retry vs config-fix vs user-error)
- `UX-7` — First-run config validation + remediation wizard (non-interactive guided tour)

---


## 1. LLM Runtime · Providers · Tool-Call Repair · Prompt Caching

_18 items_


### `LLM-1` Implement plain-text tool-call promotion from leaked text responses  ★★★★★ · M · missing

- **Reference:** openclaw/packages/tool-call-repair/src/promote.ts: `promoteStandalonePlainTextToolCallMessage` extracts '[tool_name: args]' blocks from plain text and promotes to structured tool calls; stream-normalizer.ts: state machine for detecting inline JSON payloads
- **Muse approach:** Create packages/model/src/tool-call-promoter.ts with functions: (1) `detectPlainTextToolCall(text, allowedNames)` to identify candidate tool syntax, (2) `promoteToToolCall(block, resolver)` to rebuild structured calls. Integrate into the agent-core model-loop after text accumulation but before done-event emission. Small local models often emit '[fetch_content: {"url": "..."}]' instead of native tool calls; promotion recovers intent from the escaped text.
- **Value:** Hermes sees 8-15% improvement in small-model tool-calling reliability by promoting leaked plain-text blocks; Muse currently silently discards these.
- **Verify:** Unit test in packages/model/test/tool-call-promoter.test.ts with fixtures of leaked Ollama/LM Studio output; integration test in agent-core showing a plain-text tool call reaches tool dispatch.

### `LLM-2` Implement thinking-level budgeting (token budgets per reasoning level)  ★★★★ · M · partial

- **Reference:** openclaw/packages/llm-core/src/types.ts: `ThinkingBudgets` interface with per-level token caps; hermes-agent/agent/anthropic_adapter.py: `THINKING_BUDGET` dict mapping efforts to token limits
- **Muse approach:** Add `thinkingBudgets` field to `ModelRequest` (packages/model/src/index.ts) and extend `ModelCapabilities` with per-level budget metadata. Adapter-specific implementations (adapter-anthropic.ts, adapter-ollama.ts) extract declared budgets and encode them in wire payloads (Anthropic's `output_config.budget_tokens`, Ollama's `num_predict` override per effort level). Store budget discovery in the model metadata during listModels so budget conflicts surface early.
- **Value:** Small local models hit reasoning-budget limits unpredictably; budgeting prevents runaway token consumption and enables honest cost forecasting per reasoning level.
- **Verify:** Add test in packages/model/test covering budget validation against model metadata, wire encoding in adapter tests, and runtime rejection when requested budget exceeds model max.

### `LLM-3` Implement Anthropic cache-retention and session-affinity headers  ★★★★ · M · partial

- **Reference:** openclaw/packages/llm-core/src/types.ts: `cacheRetention` ('none'|'short'|'long'), `sessionId`, `promptCacheKey` in StreamOptions; hermes-agent/agent/prompt_caching.py: system_and_3 layout strategy applying cache_control to system + last 3 non-system messages
- **Muse approach:** Extend packages/model/src/index.ts `ModelRequest` with `cacheRetention?: 'short'|'long'` and `sessionId?: string` fields. In adapter-anthropic.ts, apply cache_control breakpoints using the Hermes system_and_3 strategy: wrap system + last 3 non-system messages with `cache_control: { type: 'ephemeral', ttl: cacheRetention === 'long' ? '1h' : '5m' }`. Add session-affinity headers when sessionId is set (Anthropic beta-user-id header). Wire through the agent-core model-invocation layer so cache options flow from settings → request metadata.
- **Value:** Anthropic prompt caching cuts multi-turn conversation costs by ~75%; Muse builds long system prompts (persona + memory + tools + RAG) that re-hit cache every turn. Missing session affinity loses cache hits across agent restarts.
- **Verify:** Unit test in packages/cache/test showing cache_control insertion and TTL mapping; integration test with real Anthropic API (gated by API-key check) verifying cache hit reported in usage.cache_read_input_tokens.

### `LLM-4` Implement message-level tool-call deduplication by hash  ★★★★ · S · missing

- **Reference:** hermes-agent/agent/tool_dispatch_helpers.py: module-level utilities for parallelism, mutation tracking; agent loop deduplicates tool calls within a single message by serialized arguments to prevent duplicate file writes
- **Muse approach:** Create packages/agent-core/src/tool-call-deduplicator.ts (or extend existing ToolCallDeduplicator if present) with a function `deduplicateToolCallsInMessage(toolCalls, hashFn)` that removes exact duplicates (same name + arguments hash) while preserving order of first occurrence. Use SHA256 of JSON-serialized arguments as the hash. Integrate into model-loop.ts before tool-batch dispatch. Small models sometimes emit the same tool call twice (e.g., fetch_content with identical URL); dedup prevents double-execution and idempotency violations.
- **Value:** Ollama/LM Studio small models emit duplicate tool calls in a single turn; without dedup, file_write executes twice on the same path, corrupting files. Hermes dedup is a safety gate.
- **Verify:** Unit test in packages/agent-core/test with multiple tool calls, some identical, verifying dedup preserves first and removes duplicates.

### `LLM-5` Add provider-specific thinking-format adapters (Qwen/DeepSeek/OpenAI)  ★★★ · M · partial

- **Reference:** hermes-agent/agent/think_scrubber.py: StreamingThinkScrubber state machine strips '<think>', '<thinking>', '<reasoning>', '<REASONING_SCRATCHPAD>' tags per-delta; openclaw/packages/agent-core/src/reasoning.ts: `resolveAgentReasoningOption` with thinkingLevelMap per model API
- **Muse approach:** Extend packages/model/src/provider-shared.ts with a `createLeadingThinkStripper` variant (currently exists but only for Ollama). Add format-discovery to adapter listModels: query model metadata (OpenRouter, models.dev) to detect which format the model uses. Store in `ModelCapabilities.reasoning` + a new `thinkingFormat` field. Wire adapters (adapter-ollama.ts, adapter-openai.ts) use the format-specific stripper on incoming deltas and apply header logic (Qwen's `thinking` block vs Anthropic's output_config).
- **Value:** Qwen/DeepSeek models via Ollama emit reasoning in their own XML-like syntax; without per-format stripping, the syntax leaks into user-facing text or blocks tool-calling. Hermes handles 5 formats; Muse only strips Ollama Qwen.
- **Verify:** Integration test in packages/model/test covering a Qwen model (if available locally) or mocked response with Qwen thinking tags; verify scrubber produces clean text-delta stream events.

### `LLM-6` Implement per-model adaptive thinking-level mapping (effort aliases)  ★★★ · M · partial

- **Reference:** hermes-agent/agent/lmstudio_reasoning.py: `resolve_lmstudio_effort` maps user reasoning_config.effort ('medium'/'high'/'xhigh') onto LM Studio's allowed_options (which may be ['off','on'] or ['off','minimal','low','medium','high','xhigh']), returning None when unsupported so the field is omitted; anthropic_adapter.py: ADAPTIVE_EFFORT_MAP with 'minimal'→'low' downgrade for older Claude
- **Muse approach:** Extend packages/model/src/index.ts `ModelCapabilities` with `thinkingEffortMap?: Record<string, string | null>` (normalized effort → provider-native value, or null to omit). In adapter listModels, query model metadata (OpenRouter, models.dev snapshot, or Ollama /api/show) for `capabilities.reasoning.allowed_options` and build the map. In stream/generate methods, resolve the requested reasoning level through the map before encoding on the wire. Muse's agent-core already has a reasoning-level abstraction; map it through per-model adapters.
- **Value:** LM Studio and older Claude models have non-standard reasoning-effort vocabularies; wrong effort values cause 400 errors or silent fallback. Adaptive mapping hides provider differences from the agent loop.
- **Verify:** Test in packages/model/test with mock LM Studio /api/models response containing allowed_options; verify adapter produces correct effort string or omits field when unsupported.

### `LLM-7` Implement model-metadata versioning and stale-detection for local endpoints  ★★★ · M · missing

- **Reference:** hermes-agent/agent/model_metadata.py: disk-cache with TTL (_MODEL_CACHE_TTL=3600 for OpenRouter, _ENDPOINT_MODEL_CACHE_TTL=300 for local endpoints), atomic_json_write for safe concurrent writes, endpoint-specific caching keyed by (host, port, model-name)
- **Muse approach:** Add a `ModelMetadataStore` interface in packages/model/src/model-catalog.ts. Extend OllamaProvider.listModels to cache the response in ~/.muse/cache/ollama_models_<host>_<port>.json with 5m TTL (local changes are fast; 5m captures most updates). On each list call, compare timestamps; if cache is fresh, return cached. If stale, re-query and write atomically. When a model appears to be new (unknown sha256 of capabilities) or disappears, refresh immediately. Record the endpoint's last-known-good capabilities snapshot so a model-delete doesn't cause cascading failures in the agent loop.
- **Value:** Ollama can add/remove/update models during Muse runtime; stale listModels caches cause the agent to try removed models or miss new reasoning models. Hermes with 5m local TTL catches 95%+ of user-level changes without network roundtrips.
- **Verify:** Test in packages/model/test: mock listModels call with cached response; verify 5m TTL is respected; add a model and verify immediate refresh after timestamp mismatch.

### `LLM-8` Implement tool-call argument coercion with schema-guided type repair  ★★★ · M · partial

- **Reference:** openclaw/packages/tool-call-repair/src/promote.ts: PromotedPlainTextToolCallBlockFactory builds provider-native tool calls with argument coercion; hermes-agent/agent/message_sanitization.py: `_repair_tool_call_arguments` handles JSON parse failures and type mismatches
- **Muse approach:** Muse already has packages/tools/src/tools-argument-validation.ts with `coerceToolArguments` (scalar + structured coercion). Extend it with a `validateAndRepairToolCall(toolCall, schema)` function that: (1) coerces args via coerceToolArguments, (2) walks tool-call argument strings for unescaped control chars / surrogates and repairs them, (3) validates required args are present, returning a repair report. Integrate into agent-core tool-batch dispatch after a tool call is extracted from the model response but before execution, so the runtime can log repair metrics and choose to re-ask the model if coercion changes semantics.
- **Value:** Small models emit tool arguments with off-by-one type errors ('"5"' instead of 5, or stringified JSON for object params). Muse's current coercion is lossless but silent; repair + validation metrics show when models consistently fumble certain schema shapes.
- **Verify:** Unit test in packages/tools/test with tool calls containing type mismatches; verify coercion succeeds and repair report is accurate; integration test showing metrics recorded.

### `LLM-9` Implement provider-aware token-counting and context-budget enforcement  ★★★ · M · partial

- **Reference:** hermes-agent/agent/model_metadata.py: `get_model_metadata` fetches context windows and max output, used by context-compression logic; chat_completion_helpers.py: `estimate_request_context_tokens` for both Chat Completions and Responses API payloads
- **Muse approach:** Create packages/model/src/token-estimation.ts with provider-aware estimators: `estimatePromptTokens(model, messages, tools)` and `estimateCompletionTokens(model)`. For Anthropic, apply Anthropic's token-counting rules (tool definitions are cheaper per token). For OpenAI, use their per-model estimates. For Ollama, use a simple char/4 heuristic since Ollama doesn't expose token counters. Integrate into agent-core's context-budgeting layer so the agent can make trim decisions (truncate tool output, drop old memory) BEFORE calling the model, preventing silent truncation.
- **Value:** Ollama silently truncates long prompts (observed: 8K context ate entire --with-tools prompt, left 1 output token). Pre-flight token budgeting lets the agent gracefully degrade instead of hitting the context ceiling.
- **Verify:** Unit test in packages/model/test with known-good token counts from OpenAI (test fixtures); integration test with real Ollama showing estimate vs. actual token usage.

### `LLM-10` Implement provider-capability discovery from models.dev or vendor registries  ★★ · L · missing

- **Reference:** hermes-agent/agent/models_dev.py: full ModelInfo dataclass (reasoning, tool_call, attachment, context_window, cost_input/output, cost_cache_read/write, knowledge_cutoff, interleaved reasoning format); bundles offline snapshot + disk cache + network refresh every 60m
- **Muse approach:** Create packages/model/src/model-catalog.ts with a ModelCatalog interface. Lazy-load a bundled models.dev snapshot (run-build-time fetch from https://models.dev/api.json) into packages/model/src/models-dev-snapshot.json. At adapter listModels time, merge snapshot metadata (cost, cache pricing, reasoning format, context limits) with provider-native responses. Cache in ~/.muse/cache/models_catalog.json with 1h TTL. Fall back to provider-native metadata if snapshot is stale; upgrade snapshot weekly in CI.
- **Value:** Offline-first model metadata (cost, reasoning format, cache support) lets Muse make deployment-aware decisions without network calls. Small models emit wrong capability flags; the snapshot is ground truth.
- **Verify:** Unit test loading snapshot and merging with mocked provider response; integration test with real Ollama listModels showing merged capabilities including reasoning format and cost fields from snapshot.

### `LLM-11` Implement stateful streaming-delta text normalization for surrogate characters and invalid UTF-8  ★★ · S · partial

- **Reference:** hermes-agent/agent/message_sanitization.py: `_sanitize_messages_surrogates` walks nested message/tool-call structures replacing UTF-8 lone surrogates with U+FFFD; `_escape_invalid_chars_in_json_strings` escapes unescaped control chars (0x00-0x1F) inside JSON
- **Muse approach:** Create packages/model/src/text-normalizer.ts with two stateless helpers: (1) `sanitizeSurrogates(text: string)` — regex-replace lone surrogates (U+D800–U+DFFF) with U+FFFD, (2) `sanitizeInvalidJsonChars(jsonStr: string)` — character-by-character walk tracking string boundaries, escaping unescaped control chars. Apply sanitizeSurrogates to every text-delta before emitting from stream handlers (adapter-ollama.ts, adapter-openai.ts). Apply sanitizeInvalidJsonChars to tool-call argument strings before JSON.parse so byte-level reasoning models (Xiaomi/mimo, Kimi, GLM) don't crash the OpenAI SDK.
- **Value:** Byte-level reasoning models (Xiaomi, Kimi) emit lone surrogates and control chars in reasoning blocks; Muse currently silent-fails on json.dumps. Hermes prevents SDK crashes with pre-flight scrubbing.
- **Verify:** Unit test in packages/model/test with synthetic surrogate/control-char payloads; mock a stream event from a reasoning model and verify the scrubber produces safe output.

### `LLM-12` Implement Ollama reason-effort probing and adaptive request building  ★★ · S · missing

- **Reference:** hermes-agent/agent/lmstudio_reasoning.py: probe allowed_options from /api/models response, map user reasoning_config to provider vocabulary, return None to omit unsupported efforts; chat_completion_helpers.py: build request kwargs conditionally based on model capabilities
- **Muse approach:** In adapter-ollama.ts `listModels`, extract `capabilities.reasoning.allowed_options` from each /api/show response (Ollama ≥0.30.0+). Store in a per-model metadata cache (keyed by model ID). In `stream` and `generate`, if reasoning is requested, check allowed_options and resolve the user's reasoning effort ('medium'/'high'/'xhigh') through a mapping table (Ollama uses OpenAI-style effort names). Only include `reasoning_effort` on the wire if the resolved effort is in the allowed set; omit otherwise (let Ollama fall back to model default). This prevents 400 errors on reasoning-capable models that don't expose the full effort range.
- **Value:** Qwen 3.5/3.6 on Ollama support reasoning but may limit effort levels; Muse currently hardcodes 'medium' without probing, causing silent failures or unexpected token usage.
- **Verify:** Integration test in packages/model/test with a local Ollama instance (if available) or mocked /api/show response; verify allowed_options parsing and request building.

### `LLM-13` Implement graceful degradation for providers without streaming  ★★ · M · partial

- **Reference:** openclaw/packages/llm-runtime/src/stream.ts: `stream()` and `complete()` entry points are both present; hermes-agent uses chat_completions.py transport layer with fallback to non-streaming requests when SSE fails
- **Muse approach:** Muse's ModelProvider interface already has both `generate()` (blocking) and `stream()` (async iterable). Enhance the agent-core model-loop.ts to detect when a provider's stream() returns empty or times out, then fall back to generate() and emit synthetic text-delta events from the buffered response. Record a fallback event in metrics so users know when streaming degraded. Ensure the fallback path still captures tool calls, usage, and citations correctly.
- **Value:** Network flakes or provider-side stream failures currently cause hard failures; graceful fallback to polling completes the turn with slight latency increase instead of aborting. Hermes fallback catches ~5% of production issues.
- **Verify:** Test in agent-core/test: mock a stream() that yields nothing, verify model-loop falls back to generate() and emits correct events; verify metrics record the fallback.

### `LLM-14` Implement request payload inspection hooks for debugging and sanitization  ★★ · M · partial

- **Reference:** openclaw/packages/llm-core/src/types.ts: `onPayload` hook in StreamOptions to inspect/replace provider payloads before sending; hermes-agent uses this for request logging and sanitization checkpoints
- **Muse approach:** Extend packages/model/src/index.ts `ModelRequest` with optional `onPayload?: (payload: unknown, model: ModelInfo) => unknown` callback. Thread it through adapter-base.ts OpenAICompatibleProvider.stream() / generate() methods. Before fetch, invoke the hook (if present) and use the result as the wire payload. Apply this to sanitization: hermes wraps onPayload with `_sanitize_messages_surrogates` so every request is scrubbed before send. Muse's local-only context means onPayload is also useful for bytecode inspection of large prompts before they hit the model.
- **Value:** Request hooks enable observability (logging large payloads for debugging), security (sanitization), and cost optimization (pre-send message compression). Openclaw uses hooks extensively; Muse lacks them.
- **Verify:** Unit test in packages/model/test with a mock hook that logs/modifies payloads; verify the modified payload reaches the provider wire method.

### `LLM-15` Implement per-provider stream-error recovery with exponential backoff  ★★ · M · partial

- **Reference:** hermes-agent/agent/chat_completion_helpers.py: per-provider request timeouts and stale-call detection; OpenAI SDK has built-in retry with exponential backoff for rate limits and transient errors
- **Muse approach:** Create packages/resilience/src/stream-retry.ts with `retryableStreamError(error, provider)` function that classifies stream errors (rate limit → backoff, timeout → immediate retry, parse error → abort). Extend OpenAICompatibleProvider.stream() to wrap the fetch stream in a retry loop (exponential backoff: 100ms initial, max 10s, jitter). Record retry counts in metrics. Disable retries for non-idempotent operations (tool execution, not text generation).
- **Value:** Ollama streams timeout or stall on heavy system load; retry with backoff completes the turn instead of failing. Hermes retry logic catches ~10% of transient failures.
- **Verify:** Test in packages/model/test: mock a stream that throws a rate-limit error, verify retry succeeds; mock a hard error, verify abort. Measure backoff delays.

### `LLM-16` Implement model-capability fallback ranking for tool selection  ★★ · M · missing

- **Reference:** openclaw/packages/model-catalog-core/src/model-catalog-refs.ts: stores and normalizes model capability metadata (supportsTools, supportsStructuredOutput, thinkingFormat); agent can query and rank models by capabilities to pick the best fit
- **Muse approach:** Extend packages/model/src/index.ts with a `ModelSelectionCriteria` interface (already partial) to include capability-based ranking. Add a function `rankModelsByCapabilities(criteria, availableModels)` that filters models by required capabilities and sorts by preference (least cost, lowest latency, highest reasoning level). Integrate into agent-core's model-selection layer so when the primary model doesn't support tools, the agent can transparently pick a fallback model from the registry that does. Store fallback preferences in settings so users can configure their tier-1 model (local fast) and tier-2 (remote capable).
- **Value:** Small local models lack tool-calling; without fallback ranking, the agent either fails or makes bad decisions. Ranked fallback lets Muse degrade gracefully (local → remote) while staying within user's configured budget and latency SLAs.
- **Verify:** Unit test in packages/model/test: given multiple models with different capability subsets, verify ranking returns best fit for a given criteria; integration test with model registry showing fallback selection.

### `LLM-17` Implement usage-normalization for providers with non-standard token-counting  ★ · S · partial

- **Reference:** openclaw/packages/llm-core/src/types.ts: Usage interface with input/output/cacheRead/cacheWrite fields; each provider adapter normalizes its wire format (e.g., OpenAI's prompt_tokens_details.cached_tokens, Anthropic's cache_read_input_tokens) to the unified struct
- **Muse approach:** Extend packages/model/src/index.ts `ModelUsage` to include `cacheWriteTokens?: number` (Anthropic-specific). In each adapter's response parser (adapter-anthropic.ts, adapter-openai.ts, adapter-ollama.ts), normalize the wire-format usage into ModelUsage with all fields filled. For Ollama, which may not report cached tokens, default to 0. For OpenAI, map `prompt_tokens_details.cached_tokens` to `cacheReadTokens`. Ensure observability/token-usage recording (packages/observability/src/observability-token-cost.ts) handles all fields so cost rollup includes cache savings.
- **Value:** Anthropic cache writes cost 10% of reads; without normalized usage recording, Muse can't measure cache effectiveness or forecast costs accurately when mixing providers.
- **Verify:** Unit test in packages/model/test for each adapter's usage-parsing; verify all fields (including cache tokens) normalize correctly; integration test in packages/observability showing cost calculation includes cache components.

### `LLM-18` Implement API-key rotation and provider-auth fallback chains  ★ · L · missing

- **Reference:** hermes-agent/agent/anthropic_adapter.py: supports API keys, OAuth setup tokens, and Claude Code keychain credentials with automatic detection; bedrock_adapter.py: AWS identity chains (env, profile, STS assume-role)
- **Muse approach:** Create packages/model/src/auth-chain.ts with an `AuthResolver` interface. For each provider adapter, implement an auth-resolution chain: OpenAI: env var → settings → hardcoded key; Anthropic: API key → OAuth token → Claude Code credentials → keychain. On auth failure (401), rotate to the next credential in the chain and retry. Record successful credential in metrics so users know which auth method worked. This is LOCAL-ONLY because credentials are never shipped to a server; they're resolved at request time in the runtime.
- **Value:** Users often configure multiple API keys (dev vs prod, multiple orgs); fallback chains let the agent pick the right credential without trial-and-error. OAuth expiry causes silent failures; credential rotation catches expiry and promotes the next key.
- **Verify:** Unit test in packages/model/test: mock multiple credentials in settings, verify resolution order; integration test with real API (if safe) or mock 401 response, verify fallback.

## 2. Context Engineering · Compression · References · Windowing

_20 items_


### `CTX-1` Automatic context-reference expansion with @ syntax  ★★★★★ · M · missing

- **Reference:** hermes: agent/context_references.py - parse_context_references() + preprocess_context_references_async() handles @file, @folder, @git, @url, @diff, @staged
- **Muse approach:** Add a context-references package (or extend packages/agent-core/src) with a parser for @file:path, @folder:path, @git:ref, @url:... tokens in user messages. Expand references into inline blocks with token budgeting (hard limit 50% of context, soft 25%), blocking expansion if it exceeds capacity. Land in packages/agent-core/src/context-references.ts with exports for parse/expand/preprocess.
- **Value:** Users can inline file snippets, folder trees, git diffs into messages without copy-paste, drastically reducing manual context injection friction and token overhead by smart inlining.
- **Verify:** Unit test: @file with line ranges (@file:path:10-20), @folder (recursive tree), @git:HEAD (diff); integration: token budget enforcement blocks when > 50% of window

### `CTX-2` Preflight compression check before API call  ★★★★★ · S · missing

- **Reference:** hermes: turn_context.py lines 292-325 - estimate_request_tokens_rough() before API, triggers preflight compression if should_compress() returns true
- **Muse approach:** Add preflight-compression logic to packages/agent-core/src/runtime.ts (or agent orchestrator). Before calling the model, estimate tokens using estimateConversationTokens(); if over threshold, call trimConversationMessages() inline so the first LLM call already fits. Gate via MUSE_PREFLIGHT_COMPRESSION_ENABLED env var, default true.
- **Value:** Avoids first-pass failures from token overflow and keeps sessions from needing recovery/retry when they cross the window just before the model call.
- **Verify:** Scenario: 20k estimated tokens, 24k window; preflight trims to <24k before API, no overflow error

### `CTX-3` Multi-pass conversation compression with iterative summary refinement  ★★★★ · M · partial

- **Reference:** hermes: agent/context_compressor.py lines 13-16 - iterative summary updates (preserves info across multiple compactions); turn_context.py lines 337-364 shows 3-pass loop checking _compression_made_progress()
- **Muse approach:** Enhance packages/memory/src/memory-token-trim.ts to support iterative compression: after first summarization pass, re-estimate tokens and if progress was made (> 5% token reduction OR message count drop), re-run compression on the result. Stop when no progress is detected. Add progress-check function: _compressionMadeProgress(origTokens, newTokens, origCount, newCount) returns boolean.
- **Value:** Successive compression passes recover more detail in summaries when middle turns are deeply nested, improving semantic retention without hitting diminishing returns.
- **Verify:** Test: compress 40 messages, verify 2-3 passes fire; token reduction > 5% triggers next pass; check final summary preserves more specifics than single-pass

### `CTX-4` Configurable compression thresholds (working budget vs hard limit)  ★★★★ · S · partial

- **Reference:** hermes: turn_context.py line 81-82 - workingBudgetTokens vs hardBudgetTokens; context_compressor.py lines 64-66 threshold_percent, protect_first_n, protect_last_n
- **Muse approach:** Extend packages/memory/src/memory-token-trim.ts ConversationTrimOptions to support two threshold tiers: workingBudgetTokens (soft proactive trigger, e.g. 75% of window) and hardBudgetTokens (absolute limit). Also expose protect_first_n (count of leading messages to keep verbatim) and protect_last_n (tail budget mode vs fixed count). Emit via MUSE_COMPRESSION_WORKING_BUDGET, MUSE_COMPRESSION_PROTECT_FIRST_N env vars.
- **Value:** Allows proactive recompaction while quality is high (working budget) instead of only reacting when hard limit is hit, improving summary quality incrementally.
- **Verify:** Config: working=16k, hard=20k on 20k window; compress at 16k not 20k; test protect_first_n=3 keeps first 3 user messages verbatim

### `CTX-5` Head/tail message protection with token-budget tail mode  ★★★★ · M · partial

- **Reference:** hermes: context_compressor.py line 257-267 - _estimate_msg_budget_tokens() counts full tool_call envelope not just args; turn_context.py protects head (protect_first_n) and tail (protect_last_n via token budget not fixed count)
- **Muse approach:** Refactor packages/memory/src/memory-token-trim.ts to replace fixed protect_last_n message count with protect_last_n_tokens (token budget). When trimming, accumulate tokens backward from tail until token budget is exhausted, not just a message count. This handles large multi-tool-call assistant messages correctly (258 tokens vs 1 message). Add _estimateMessageTokensForBudget() that counts tool_call envelope weight, not just content.
- **Value:** Prevents tail protection from being gamed by large assistant turns with parallel tool calls that look like '1 message' but are actually 1000 tokens, making compression budgets predictable.
- **Verify:** Scenario: 1 assistant message with 8 parallel tool_calls weighs ~1200 tokens; protect_last_n_tokens=2000 preserves it; protect_last_n_tokens=800 drops it

### `CTX-6` Image/video content token estimation and selective pruning  ★★★★ · M · partial

- **Reference:** hermes: context_compressor.py lines 153-163 - _IMAGE_TOKEN_ESTIMATE (1600 flat per image), _IMAGE_CHAR_EQUIVALENT, _content_length_for_budget() counts images; lines 311-333 _strip_image_parts_from_parts() replaces old images with [screenshot removed] placeholder
- **Muse approach:** Extend packages/memory/src/memory-token-trim.ts _estimateMessageTokensForBudget() to detect multimodal content (image_url, input_image, image parts in lists) and add flat 1600 tokens per image. When trimming old history, selectively strip images via _stripImagePartsFromContent() replacing them with [screenshot removed] placeholder. Preserve recent images (tail protection).
- **Value:** Multimodal conversations (vision agent output, screenshots, diagrams) no longer blow token budgets silently; trimming can recover significant space by dropping old images while keeping recent visual context.
- **Verify:** Scenario: 5 screenshot messages (8k tokens) + text; trim with image budget handling drops old images, preserves recent ones, reduces tokens by ~80%

### `CTX-7` System-prompt three-tier assembly (stable/context/volatile)  ★★★★ · M · partial

- **Reference:** hermes: agent/system_prompt.py lines 10-20 - three tiers: stable (identity, tools, platform hints), context (context files, caller system_message), volatile (memory, USER.md, timestamp). Stable cached for prefix-cache warmth.
- **Muse approach:** Extend packages/prompts/src (or create packages/agent-core/src/system-prompt-builder.ts) to structure prompt assembly into three functions: buildStableSystemTier() (identity + tool guidance + platform hints; built once per session), buildContextSystemTier(cwd) (load .cursorrules, CLAUDE.md, caller system_message; built per session), buildVolatileSystemTier() (memory, timestamp, current mode; built every turn). Join with double newlines. Return prompt + tier boundaries for cache instrumentation.
- **Value:** Enables upstream prefix caching on Claude/Anthropic models by keeping stable tier immutable, dramatically improving latency on long-running sessions. Also lets callers selectively override context files per session.
- **Verify:** Build prompt 3x, verify stable tier never changes; context tier changes only across sessions; volatile tier changes every turn; check prefix cache hit rate increases

### `CTX-8` Provider-specific context-length resolution with fallback chain  ★★★★ · S · partial

- **Reference:** hermes: agent/model_metadata.py lines 190-300+ - get_model_context_length() tries: cached value, provider API (Anthropic/OpenAI), hardcoded family fallback, error-extracted from failed request
- **Muse approach:** Extend packages/model-adapters/src with a model-metadata.ts that caches context lengths per model/provider and tries a fallback chain: localStorage cache, provider catalog API (for known providers), hardcoded family defaults (claude-opus=200k, gemma4=8k), or return a conservative default (8k). Update after each failed request that includes a context-limit error. Call this early in autoconfigure so compression thresholds can be sized correctly.
- **Value:** Muse can run across many model/provider combos without guessing context lengths; failures are recorded so later attempts work; local-only fallback (hardcoded) keeps things working offline.
- **Verify:** Query claude-opus via Anthropic API: returns 200k; query unknown model: falls back to 8k default; cache it; restart: uses cached value

### `CTX-9` Compressed summary metadata tagging (non-wire-exposed keys)  ★★★ · S · missing

- **Reference:** hermes: context_compressor.py lines 75-85 - COMPRESSED_SUMMARY_METADATA_KEY = '_compressed_summary' (underscore-prefixed so wire sanitizers strip it before reaching strict gateways like Fireworks)
- **Muse approach:** Update packages/memory/src/memory-token-trim.ts insertCompactionSummary() to tag summary messages with _compressed_summary: true metadata key. Add a sanitizer in packages/model (or before wire transmission) that strips underscore-prefixed keys from all messages before API calls. Document the contract: underscore keys = internal only, never reach the wire.
- **Value:** Lets frontends (CLI, desktop, TUI, gateway) render summaries distinctly from real user/assistant messages without content-prefix heuristics, and prevents strict API gateways from rejecting unknown-key payloads.
- **Verify:** Compress conversation, check summary message has {_compressed_summary: true}; before wire call, verify key is stripped; test Fireworks-compatible API call succeeds

### `CTX-10` Summary end-of-summary marker to prevent model confusion  ★★★ · S · missing

- **Reference:** hermes: context_compressor.py lines 92-95 - _SUMMARY_END_MARKER = '--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---' prevents weak models from re-emitting summary as output
- **Muse approach:** Update packages/memory/src/memory-token-trim.ts insertCompactionSummary() to append _SUMMARY_END_MARKER to every summary message (whether standalone or merged into tail). Add a test case with a weak/small model to verify it doesn't regurgitate the summary; also test that the marker is included in summary block rendered to user.
- **Value:** Prevents hallucinations on small models that misread the summary as fresh user input or re-emit it as their own output, increasing reliability on gemma4 and other local-first models.
- **Verify:** Compress & inject summary, verify marker is appended; run with gemma4, check output does NOT repeat summary text

### `CTX-11` Coding-context posture and workspace snapshot injection  ★★★ · M · partial

- **Reference:** hermes: agent/coding_context.py lines 1-50 - RuntimeMode selects 'coding' vs 'general', caches workspace snapshot (git root, lockfile, context files) into stable system-prompt tier; lines 51-149 model-specific edit-format steering
- **Muse approach:** Extend packages/autoconfigure/src/context-engineering-builders.ts to detect if running in a git repo and (when MUSE_CODING_CONTEXT_ENABLED=true) inject a 'Coding Context' system section into the prompt that includes: git root, detected package manager/lockfile, list of context files (.cursorrules, .hermes.md, CLAUDE.md), and model-family edit-format nudge (replace vs patch). Build once at session start, cache in system prompt tier (never re-probe per turn).
- **Value:** Coding models get grounded in the project's actual structure and tool conventions without needing tool calls; also steers them toward the edit format they were trained on, reducing rewrites and wasted reasoning.
- **Verify:** In a git repo with package.json, detect it; inject 'Coding Context' with git root, npm as package manager, .cursorrules detected; verify never re-probed on turn 2+

### `CTX-12` User/project memory section rendering with MEMORY.md and USER.md  ★★★ · M · partial

- **Reference:** hermes: agent/system_prompt.py lines 113-150 (build_system_prompt_parts); agent/prompt_builder.py lines 144-150 MEMORY_GUIDANCE; turn_context.py handles memory prefetch + on_turn_start() lifecycle
- **Muse approach:** Extend packages/prompts/src/system-prompt-layer-registry.ts or create packages/agent-core/src/memory-section-renderer.ts to support: renderUserMemorySectionFromStore(userMemoryStore) which loads user preferences, personality, habits from store and renders into a stable '[User Profile]' block; also renderProjectMemorySection(path) to optionally load .hermes.md or project-local MEMORY.md into volatile tier. Add lifecycle hook on_turn_start() to prefetch external memories.
- **Value:** Agent remembers user preferences, project conventions, and long-term facts without tool calls; memory is always present in prompt (not fetched on demand), improving consistency and reducing tool-call overhead.
- **Verify:** Load user memory with timezone=UTC, workStyle=async; render into prompt; verify section appears; test project MEMORY.md loads into volatile tier

### `CTX-13` Auxiliary model for compression summarization  ★★★ · M · missing

- **Reference:** hermes: agent/context_compressor.py lines 26 (from agent.auxiliary_client), conversation_compression.py lines 74-200 check_compression_model_feasibility() probes aux model and warns if too small; uses cheap/fast aux for summaries
- **Muse approach:** Create packages/model-adapters/src/auxiliary-model-client.ts that manages a separate LLM client for compression tasks (cheap, local-first by default). Add env vars MUSE_COMPRESSION_MODEL (default 'gemma4:12b'), MUSE_COMPRESSION_BASE_URL. When trimConversationMessages() needs a summary, call getAuxiliaryClient('compression').complete(summarizePrompt) instead of the main model. Add feasibility check at startup: warn if aux model context < main model's compression threshold.
- **Value:** Keeps compression lightweight on local models (gemma4 can summarize while main model is available); doesn't bottleneck the primary model on summarization; users can swap a tiny model in for aux tasks.
- **Verify:** Set aux to tiny local model; trigger compression; verify aux.complete() is called, main model not blocked; test warning fires if aux context < threshold

### `CTX-14` Structured summary template with resolved/pending tracking  ★★★ · M · partial

- **Reference:** hermes: context_compressor.py lines 37-69 - summary template sections: '## Historical Task Snapshot', '## Historical In-Progress State', '## Historical Pending User Asks', '## Historical Remaining Work'; each marked HISTORICAL to prevent model from treating it as active instructions
- **Muse approach:** Update packages/memory/src/memory-token-trim.ts insertCompactionSummary() to use a structured template for the summary content: include sections for [Resolved Questions], [In-Progress Work], [Pending User Requests], [Key Files/Context], each marked with ## Historical prefix. Add a summarize-prompt template builder in packages/prompts that instructs the aux model to extract these sections from the compacted conversation. Prefix the whole summary with the HISTORICAL_SUMMARY_PREFIX warning.
- **Value:** Summaries are structured and scanned predictably by the model; historical sections are clearly marked as non-actionable, reducing false task resumption after compression.
- **Verify:** Compress conversation, verify summary has '## Historical Task Snapshot', '## Historical Pending Asks', each section extracted correctly; test model doesn't re-execute pending asks

### `CTX-15` Path mention extraction for relevant-file tracking  ★★ · S · missing

- **Reference:** hermes: context_compressor.py lines 181-215 - _PATH_MENTION_RE regex finds file paths in content, _collect_path_mentions() dedupes and limits to 12 paths per message for summarizer input
- **Muse approach:** Add path-mention extraction to packages/agent-core/src/context-transforms.ts or packages/memory/src. Create _extractPathMentions(content, limit=12) that runs a regex over conversation content and collects unique file/folder paths mentioned. Feed this list to the conversation summarizer as 'relevant files touched in this window' context so the summary can note which files were involved.
- **Value:** Summaries become more grounded by including 'files modified/read in this window' which helps the model understand scope; also enables future file-diff-aware compression strategies.
- **Verify:** Parse message mentioning /path/to/file.ts, /another/dir; extract unique paths; verify limit=12 is enforced; test regex handles quoted and unquoted paths

### `CTX-16` Tool-call argument truncation for compression (JSON-safe shrinking)  ★★ · S · missing

- **Reference:** hermes: context_compressor.py lines 336-379 - _truncate_tool_call_args_json() parses tool args, shrinks long string leaves, re-serializes to keep valid JSON (avoids broke schemas sent to strict gateways)
- **Muse approach:** Add to packages/memory/src/memory-tool-output-trim.ts (or create memory-tool-call-compression.ts) a function _truncateLongToolArguments(toolCall, maxStringChars=200) that: parses arguments JSON, recursively shortens string values > maxStringChars to maxStringChars + '...[truncated]', preserves structure, re-serializes with ensure_ascii=false (CJK/emoji safe).
- **Value:** Compression can aggressively prune old tool-call arguments (e.g. a 10k-line file content passed to an edit tool) without breaking JSON schema validation on strict API gateways.
- **Verify:** Tool call with 20kb file content in args; truncate to 200 chars; verify JSON is valid; test with Fireworks/strict-schema gateway

### `CTX-17` Turn-context abstraction for per-turn setup prologue  ★★ · L · partial

- **Reference:** hermes: agent/turn_context.py lines 87-438 - TurnContext dataclass + build_turn_context() captures per-turn setup (user message, history, system prompt, memory prefetch, plugin context) so run_conversation loop is shrunk by 470 lines of inline prologue
- **Muse approach:** Create packages/agent-core/src/turn-context.ts with a TurnContextInput + TurnContextSnapshot dataclass and buildTurnContext() function that encapsulates: user message sanitization, history hydration, memory prefetch, plugin-hook invocation (pre_llm_call), compression preflight, system prompt cache check, interrupt state reset. Return snapshot with all values the loop needs, keeping runtime.ts loop body clean.
- **Value:** Agent runtime becomes dramatically simpler; per-turn concerns (prefetch, compression, plugin composition) are isolated in testable, reusable module; easier to add new per-turn hooks without polluting orchestrator.
- **Verify:** Refactor runtime loop to use buildTurnContext(); verify all per-turn setup still happens; check loop body is < 300 lines; test with preflight compression, plugin context injection

### `CTX-18` Manual compression focus topic (guided compression)  ★★ · M · missing

- **Reference:** hermes: context_compressor.py line 92-106 focus_topic parameter, lines 503-550 _derive_auto_focus_topic() extracts topic from recent turns; conversation_loop.py has /compress <topic> command
- **Muse approach:** Add to packages/agent-core/src (or agent-orchestrator) a compress(focusTopic?: string) method that: if focusTopic is provided, passes it to the summarizer prompt so the aux model prioritizes preserving info related to that topic. Also add auto-focus detection: if compression is triggered by token overflow (not manual), sample recent 3 turns, extract keywords, use as auto focus topic. Expose via CLI /compress <topic> command or programmatic API.
- **Value:** Users can manually guide compression toward important topics ('focus on auth refactor, not the initial requirements chat'). Auto-focus makes automated compression smarter by detecting what the user was just working on.
- **Verify:** Manual: /compress 'auth refactor'; verify summary focuses on auth work. Auto: 3-turn overflow; verify auto_focus_topic is extracted; summary emphasizes recent keyword patterns

### `CTX-19` Subdirectory hints and project-structure awareness in prompts  ★★ · S · missing

- **Reference:** hermes: agent/subdirectory_hints.py generates brief readme-style hints of git subdirs, mentioned in turn_context.py and system_prompt.py for coding context
- **Muse approach:** Create packages/agent-core/src/subdirectory-hints.ts: when coding-context is enabled and in a git repo, scan immediate subdirectories (depth=1) for README.md, __init__.py, package.json to infer function. Build a brief '[Project Structure]' hint block (< 500 chars) that describes what each top-level dir does. Inject into volatile system tier. Cache per session.
- **Value:** Agents working in large monorepos get grounded in project layout without reading every README; reduces tool calls to navigate structure; guides file edits to the right directory.
- **Verify:** Scan repo with src/, tests/, docs/, scripts/ dirs; generate structure hint; inject into system prompt; verify < 500 chars

### `CTX-20` Has-content-to-compress preflight gate  ★ · S · missing

- **Reference:** hermes: context_engine.py lines 129-140 has_content_to_compress() - returns False when transcript is still entirely protected (head+tail) so /compress command doesn't waste an LLM call
- **Muse approach:** Add to packages/memory/src/memory-token-trim.ts a hasContentToCompress(messages, protect_first_n, protect_last_n) function that returns False if all messages fall within the protected head+tail boundary (nothing compressible). Call this before triggering compression so the CLI can report 'nothing to compress yet' without making an API call. Also useful for the compression command's preflight check.
- **Value:** Saves unnecessary API calls to the aux model when conversation is too short to compress. Improves perceived responsiveness and reduces overhead.
- **Verify:** 5-message conversation, protect_first_n=2, protect_last_n=2; hasContentToCompress returns false; 20-message conversation returns true

## 3. Memory · Vector Store · Active Memory · Insights · Curation

_19 items_


### `MEM-1` Implement local-model REM/Light sleep background dreaming scheduler with short-term promotion  ★★★★★ · M · missing

- **Reference:** openclaw/extensions/memory-core/src/dreaming.ts + short-term-promotion.ts: manages scheduled deep/light dreaming via cron with recall-hit frequency tracking and concept-tag scoring to promote high-value snippets from short-term daily memory into long-term durable summary
- **Muse approach:** Create packages/memory/src/dreaming-scheduler.ts implementing a managed cron pattern (using existing scheduler package) that periodically (configurable, ~1/week default) runs a local-only extraction pass: collect short-term episodic recall hits from episodic-store, rank by frequency + diversity + recency using existing actr-activation.ts + episodic-ranking.ts, promote top-K snippets into a durable DREAMS.md summary file in the workspace. Includes concept-tag extraction via simple regex/NLP heuristics on hit text to aid future recall.
- **Value:** Moves Muse from passive memory (extract-and-store) to active consolidation (promote-and-reflect), preserving high-signal memories across session boundaries without cloud. Directly mirrors OpenClaw's dreaming loop.
- **Verify:** Unit test that schedules a dream pass, verifies short-term snippets are promoted to DREAMS.md; integration test that hits > threshold frequency + diversity trigger promotion; observe concept tags in output.

### `MEM-2` Implement memory flush protocol (pre-compaction write gate with append-only constraint)  ★★★★★ · M · missing

- **Reference:** openclaw/extensions/memory-core/src/flush-plan.ts: before context compaction, generates a user-facing 'flush' turn where agent reflects on durable facts to capture before history compression, targets timestamped memory/YYYY-MM-DD.md file with append-only semantics and read-only protection on bootstrap files (MEMORY.md, DREAMS.md, SOUL.md)
- **Muse approach:** Add packages/memory/src/memory-flush-gate.ts: when conversation-trim detects working-budget or hard-limit pressure, insert a synthetic 'pre-compaction flush' turn into the agent prompt with system instruction to write durable observations to memory/YYYY-MM-DD.md (created if missing, append-only when it exists). Include guardrails: timestamp filename, read-only marker enforcement on core memory files, 3-turn lookahead to detect if flush output was already written mid-session.
- **Value:** Prevents durable facts from being lost during session compaction. Matches hermes/memory_tool.py's frozen-snapshot pattern but as a deterministic trim gate, not a manual tool. Critical for long-running agents.
- **Verify:** Test that compaction-triggered flush inserts prompt; verify timestamped memory file is created/appended; confirm append-only enforcement blocks overwrites; check that MEMORY.md is marked read-only in output.

### `MEM-3` Build deterministic curation loop: auto-archive stale episodic memories + mark for consolidation review  ★★★★ · M · missing

- **Reference:** hermes-agent/agent/curator.py: background skill curator runs on idle trigger (not cron), auto-transitions skills to stale/archived states based on inactivity timestamps (30d stale, 90d archive), maintains .curator_state with paused flag, supports pinned (protected) skills, never deletes only archives (recoverable)
- **Muse approach:** Create packages/memory/src/memory-curator.ts: deterministic per-episode curation logic that tracks last-access timestamp on episodic-store records. On scheduler tick (daily default, configurable via MUSE_MEMORY_CURATOR_INTERVAL), scan episodes older than stale_threshold (30d default), mark them readonly/archived in a .episodes.archive metadata file, remove from active recall but preserve for historical context. Include a curator-state.json for paused flag, last-run-at, archive manifest. Never delete, only archive. Respect pinned-entities.ts markers.
- **Value:** Prevents episodic memory bloat in long-running agents while keeping data recoverable. Matches hermes curator pattern but for memory, not skills. Enables memory consumption budgeting.
- **Verify:** Test stale detection by backdating episode access timestamps; verify archives are created and excluded from recall; confirm pinned episodes bypass archival; test curator-state pause flag prevents runs; verify no episodes are deleted.

### `MEM-4` Implement backup/snapshot system for episodic & knowledge stores with rollback capability  ★★★★ · M · missing

- **Reference:** hermes-agent/agent/curator_backup.py: pre-curation snapshots of skills dir as tar.gz with manifest (reason, timestamp, file count, size), supports rollback (restores + moves current aside as separate snapshot), includes cron-jobs.json snapshot to handle curator consolidation side effects
- **Muse approach:** Create packages/memory/src/memory-backup.ts: before curator runs or on manual trigger, snapshot memory stores (episodic DB, belief-provenance store, memory-wiki index if present) as atomic tar.gz in .memory/backups/<ISO-UTC>/ with manifest.json (timestamp, size, record count, trigger reason). Support rollback: move current store aside, extract snapshot, log reversal. Keep last N (default 5) backups. Guard: exclude .memory/backups/ from snapshots (recursion). Store manifest fields: backup_id, created_at, backup_reason, episodic_record_count, provenance_entry_count, snapshot_size_bytes.
- **Value:** Protects against memory corruption from curator bugs or manual edits. Matches hermes curator_backup.py pattern exactly. Essential for production reliability when episodic store is large.
- **Verify:** Create snapshot, verify tarball structure and manifest; restore snapshot, confirm episodic records match pre-snapshot state; test that rollback moves current store aside; verify exclusion of backup dir from snapshot itself; test cleanup of old backups.

### `MEM-5` Implement insight-generation pipeline: session cost/token/tool usage metrics over configurable time window  ★★★ · M · missing

- **Reference:** hermes-agent/agent/insights.py: InsightsEngine queries session DB over N days, computes overview (token count, session count, cost estimates), model/platform/tool breakdowns, skill usage distributions, activity pattern trends, formats as terminal charts and JSON
- **Muse approach:** Add packages/memory/src/session-insights.ts: query agent-core's existing message-history (via db provider abstraction), aggregate over configurable days (30 default). Compute: total sessions, messages per session, token usage (input/output via estimator), tool call distribution, memory-store write frequency, episodic hits per session. Generate both terminal summary (ascii tables) and JSON export. Use existing token-estimator.ts for token counting. No cloud calls — pure local aggregation.
- **Value:** Gives operators visibility into memory system health and cost allocation (especially important when using cloud models). Hermes surfaces this via insights CLI; Muse needs equivalent instrumentation.
- **Verify:** Integration test: create synthetic session history, generate insights, verify token sums match expected counts, check tool tallies are correct, validate JSON schema; unit test chart formatting.

### `MEM-6` Add memory-wiki indexing & query layer: structured knowledge graph with claim freshness tracking  ★★★ · L · missing

- **Reference:** openclaw/extensions/memory-wiki/src/compile.ts + claim-health.ts: maintains markdown-based knowledge graph with entities/concepts/syntheses, tracks claim freshness (contested/stale/healthy), manages related-pages graph, auto-compiles dashboard with open-questions report, supports import from external sources (ChatGPT, Obsidian)
- **Muse approach:** Create packages/memory/src/memory-wiki-index.ts: parse markdown files in memory/ directory, extract wikilinks (hyphenated filenames), build an in-memory graph of pages + claims (via regex extraction of 'fact: VALUE' entries). Store in a local sqlite cache (.memory/wiki-index.db). Support queries: 'what do we know about X', 'list related entities', 'show contradictory claims'. Include freshness scoring (age-based decay + edit-frequency bonus) to rank which claims to refresh. No embedding storage — keyword + graph nav only.
- **Value:** Transforms flat memory files into queryable knowledge base. Mirrors OpenClaw's wiki structure but simpler (no import pipeline, no Obsidian sync). Enables agent to reason about what it knows + what needs updating.
- **Verify:** Parse sample memory markdown, verify graph structure is built correctly, test wikilink extraction, confirm freshness decay formula works, query test: retrieve entities by keyword, check related-pages traversal.

### `MEM-7` Build memory-consistency checker: detect & report contradictory recalled facts with confidence levels  ★★★ · M · missing

- **Reference:** openclaw/extensions/memory-wiki/src/claim-health.ts: buildClaimContradictionClusters() groups claims by topic, detects contradictions (same subject, different value), rates contradictions as 'contested' vs 'healthy', implements WIKI_AGING_DAYS freshness decay
- **Muse approach:** Create packages/memory/src/memory-consistency-checker.ts: after episodic recall + knowledge-base query, scan returned facts for contradictions: extract (topic, claim) pairs via simple regex or NLP (e.g., 'X is Y' vs 'X is Z'), surface conflicts with confidence scores. Store conflict log in .memory/conflicts.json: {topic, claims: [{text, source_sessionId, timestamp}], severity: 'high'|'medium'|'low'}. Severity based on recency (newer claims override older) + frequency (claims with more hits win). Integrate into agent prompt as '[Memory conflicts detected: X]' note for human review.
- **Value:** Prevents agent from acting on contradictory beliefs. Addresses A-MAC conformal abstention requirement (arXiv:2603.04549). Muse's episodic-render already flags conflicts; this generalizes to all memory sources.
- **Verify:** Inject contradictory episodic recalls, verify conflict detection triggers, check confidence scoring (newer > older), test log storage format, confirm prompt injection happens and is grounded.

### `MEM-8` Add memory hotspot analyzer: identify high-recall topics and suggest curation focus areas  ★★★ · M · missing

- **Reference:** openclaw/extensions/memory-core/src/short-term-promotion.ts: deriveConceptTags() extracts recurring concepts, summarizeConceptTagScriptCoverage() shows which topics appear frequently in short-term promotions
- **Muse approach:** Create packages/memory/src/memory-hotspot-analyzer.ts: on curator schedule, analyze episodic-store recall logs (access_times field), compute topic frequency via simple NLP (extract nouns + noun phrases from episode summaries). Group into clusters: 'auth_issues', 'database_migrations', 'config_problems', etc. Rank by frequency + recency. Output .memory/hotspots-report.json: {topic: string, frequency: number, last_accessed: ISO, related_episodes: [sessionIds], recommendation: string}. Recommendation: 'consolidate', 'extract to knowledge-base', 'create task reminder', etc.
- **Value:** Surfaces memory system blindspots to operator. Enables data-driven memory curation priorities. Muse has no equivalent.
- **Verify:** Create episodic store with biased topic distribution, run analyzer, verify topic clustering, check frequency ranking, confirm recommendations are sensible, test report JSON schema.

### `MEM-9` Add memory indexing statistics: compute and expose store health metrics (fragmentation, hit rates, coverage)  ★★★ · M · missing

- **Reference:** hermes-agent/agent/insights.py: computes overview including session count, message count, tool call distribution, skill usage; openclaw memory-wiki: generates dashboard with open-questions, contradictions, freshness status
- **Muse approach:** Create packages/memory/src/memory-stats.ts: compute memory system health metrics on curator tick. Metrics: episodic-store (total records, avg summary length, fragmentation ratio = archived_records / total), belief-provenance-store (total entries, coverage = entries_with_evidence / entries), user-model-store (slots populated, version distribution), recall-hit-rate (hits per episode / total hits), hottest topics (top-5 by access), episodic hitrate over last-N-sessions (trending up/down). Output to .memory/stats.json with hourly datapoints (last 30d). Serve via optional HTTP endpoint or CLI command.
- **Value:** Enables ops to monitor memory system health. Detects degradation early (rising fragmentation, low coverage, missing provenance). Muse has no visibility today.
- **Verify:** Create memory stores in various states, run stats, verify all metrics computed, check output schema, confirm trending calculation is correct, test CLI output formatting.

### `MEM-10` Add vector search via local embeddings (optional, degraded-graceful when unavailable)  ★★ · L · partial

- **Reference:** openclaw/extensions/memory-lancedb/index.ts: integrates LanceDB + local embedding provider, stores episode vectors, supports hybrid search (BM25 keyword + vector), gracefully degrades to keyword-only when embeddings unavailable, includes auto-capture filtering to remove envelope sludge
- **Muse approach:** Extend packages/memory/src/episodic-recall.ts to optionally load local embeddings (via @xenova/transformers or similar on-device model, lazy-loaded). When available, store episode embeddings in episodic-store as optional vector field. Hybrid search: keyword search (existing jaccardSimilarity), when embeddings present also compute cosine-similarity, merge via weighted combination (default 0.6 keyword + 0.4 vector). Graceful degrade: if embedding model fails to load or is too large, emit warning and use keyword-only. No cloud egress.
- **Value:** Improves episodic recall quality for long-running agents where keyword overlap is weak (e.g., 'how did that issue resolve' vs prior 'database migration failed'). Muse already has episodic ranking; this adds the vector dimension without breaking existing flows.
- **Verify:** Load embedding model, verify vector dimension matches store schema, test hybrid search merges scores correctly, confirm keyword-only fallback when model unavailable, check memory overhead of vector storage.

### `MEM-11` Implement belief provenance backfill: add source tracking to historical episodic memories  ★★ · S · partial

- **Reference:** hermes-agent/agent/memory_provider.py + memory_tool.py: frozen memory snapshot at session start, durable belief store with entry delimiters, supports multi-platform attachment (user_id, session_id, platform); packages/memory's belief-provenance-store.ts already stores provenance (session + excerpt) but only for auto-extracted facts
- **Muse approach:** Extend packages/memory/src/belief-provenance-store.ts to support backfill mode: scan existing episodic-store.json (unversioned legacy), attempt to locate each episode's source session ID from context-reference-store metadata if available, reconstruct partial provenance (session_id + approximate timestamp), write as 'backfilled: true' entries in provenance store. Only backfill once (idempotent via marker). Enables future fact-checking tools to know 'which session said this'.
- **Value:** Enables accountability / fact-checking pipeline downstream. Closes loop with hermes' durable memory model. Muse has provenance for new facts but loses source for old recall.
- **Verify:** Create episodic store, run backfill, verify provenance entries created for existing episodes, confirm backfill marker prevents re-runs, check that sessions without context-reference metadata are marked 'unknown' rather than dropped.

### `MEM-12` Add temporal decay to episodic recall ranking with configurable half-life  ★★ · S · partial

- **Reference:** openclaw/extensions/memory-core/src/short-term-promotion.ts: DEFAULT_RECENCY_HALF_LIFE_DAYS = 14, applyTemporalDecayToHybridResults() applies exponential decay to recall scores based on episode age
- **Muse approach:** Extend packages/agent-core/src/episodic-ranking.ts: add temporalDecay(ageMs: number, halfLifeMs: number): number function using exp(-ln(2) * ageMs / halfLifeMs). Integrate into existing ranking pipeline as optional stage: after similarity compute, apply decay multiplier so episodes older than ~2 weeks gradually lose relevance. Make configurable via MUSE_EPISODIC_RECENCY_HALF_LIFE (days). Default 14d per OpenClaw convention.
- **Value:** Prevents ancient recalls from dominating current relevance. Muse has recency boost but not exponential decay; this adds standard Ebbinghaus-curve behavior matching cognitive science.
- **Verify:** Score same episode at age 0, 7d, 14d, 28d; verify decay curve matches exp(-ln(2)*t/halfLife), confirm configurable half-life works, test that 14d old = 0.5x original score.

### `MEM-13` Implement episodic consolidation: merge near-duplicate episode summaries with citation merging  ★★ · L · partial

- **Reference:** openclaw/extensions/memory-core/src/dreaming-narrative.ts + dreaming-phases.ts: consolidation phase reads dream entries, identifies umbrella-themes across similar episodes, rewrites episodic-store to store merged canonical summaries with cross-references
- **Muse approach:** Create packages/memory/src/episodic-consolidation.ts: on curator trigger or manual call, scan episodic-store for near-duplicates (cosine-sim > 0.85 on stored summaries using existing episodic-ranking.ts). For each cluster: generate umbrella narrative (template: '[Umbrella: topic] Covers episodes: [session A, B, C]. Key facts: [merged list]'). Rewrite episodic-store to replace cluster members with single umbrella + store original sessionIds in a cross_references field. Update episodic-ranking to prefer consolidated records. Idempotent via consolidation_marker in record metadata.
- **Value:** Reduces episodic memory footprint for agents running 100+ sessions. Hermes uses consolidation as opt-in curator pass; Muse needs it for scale.
- **Verify:** Create episodic store with similar episodes, run consolidation, verify clusters detected, confirm umbrella narrative generated, check cross-references preserved, validate that recall still works (umbrella is returned for related queries).

### `MEM-14` Add episodic salience-aware trimming: protect high-value episodes during context compaction  ★★ · S · partial

- **Reference:** openclaw/extensions/memory-core/src/short-term-promotion.ts: tracks queryHashes + recallDays to compute totalScore and maxScore, promotes high-scoring snippets; agent-core/src/message-importance.ts scores messages by task relevance + episodic grounding
- **Muse approach:** Extend packages/agent-core/src/message-importance.ts: when compaction runs, score episodic matches by their short-term recall contribution (using existing episodic-ranking logic + recent-access history). In conversation-trim logic, when removing old messages, preserve messages with episodic citations that have high salience-score. Add config: MUSE_EPISODIC_SALIENCE_PROTECT_THRESHOLD (default 0.7). Messages cited by high-recall episodes are harder to trim.
- **Value:** Preserves important context across compaction boundaries. Prevents losing task-critical episodes. Muse's trim already has importance-aware strategy; this adds episodic grounding awareness.
- **Verify:** Create conversation with episodic citations, set high salience on cited episode, trigger compaction, verify that messages citing high-salience episodes are preserved longer than low-salience ones.

### `MEM-15` Implement memory compression codec: store episode summaries with configurable length budgets  ★★ · L · missing

- **Reference:** hermes-agent/trajectory_compressor.py: protects first/last turns, compresses middle turns via auxiliary model summarization, targets token budget (default 15250), replaces compressed region with single summary message
- **Muse approach:** Create packages/memory/src/episodic-compression.ts: when episodic-store grows (size > threshold or record count > threshold), run compression pass: collect episodes by age cohort (1w, 1-4w, 1-3m, 3m+). For oldest cohort, apply lossy summarization: template-based reduction ('Session [date]: accomplished [X], learned [Y], unresolved [Z]') + token estimation to fit within max_summary_tokens (default 150 per episode). Rewrite episodic-store with compressed summaries, archive full text in .memory/episodic-archive/. Idempotent via compression_version marker. Deterministic (no LLM) to avoid cloud egress.
- **Value:** Prevents episodic memory from becoming a bottleneck in long-running agents (100+ sessions). Hermes uses aux-model compression; Muse needs local-only alternative.
- **Verify:** Create large episodic store, trigger compression, verify summaries are generated and fit token budget, check that archived text is retrievable, confirm idempotence (re-run doesn't double-compress), measure size reduction.

### `MEM-16` Add belief supersession tracking: maintain version history of fact updates with justification  ★★ · M · partial

- **Reference:** packages/memory/src/recently-learned.ts: selectNewSupersessions() already tracks which facts replace which; belief-provenance-store.ts stores evidence. But no version history.
- **Muse approach:** Extend packages/memory/src/memory-user-store.ts + belief-provenance-store.ts: when a fact is updated (via auto-extract or manual edit), don't overwrite: instead append new version and mark old version as superseded_by: [new_key]. Store history in provenance store with versioning: {fact_key, version: 1, value, provenance, superseded_at, superseded_by_key}. Query interface: get_fact_history(key) returns [v1, v2, ...] with timeline. Enables agent to understand belief evolution ('we thought X, then updated to Y, then learned it was Z').
- **Value:** Supports belief audit trail and learning accountability. Matches Hindsight/Artemis philosophy. Hermes doesn't have this but it's valuable for interpretability.
- **Verify:** Create fact, update it twice, call get_fact_history, verify all versions present with correct supersession chain, confirm provenance timestamps are ordered, test query with non-existent key returns empty.

### `MEM-17` Implement multi-user memory isolation with namespace segregation  ★ · M · missing

- **Reference:** hermes-agent/agent/memory_provider.py: initialize() receives user_id + user_id_alt (platform-scoped), supports per-profile provider scoping; memory_manager.py enforces one-external-provider limit but allows per-session delegation
- **Muse approach:** Extend packages/memory/src/ stores (episodic-store, belief-provenance-store, memory-wiki-index, backup snapshots): add optional user_id namespace parameter. When user_id is set, all store paths become .memory/<user_id>/episodic.json (default .memory/episodic.json for single-user). Auto-detect multi-user mode: if agent receives calls with different user_id, switch to namespaced storage. Include migration: scan legacy .memory/ for user-less records, move to default namespace on first multi-user run.
- **Value:** Enables Muse to run as shared agent across multiple users without cross-contamination. Hermes has this; Muse currently assumes single-user.
- **Verify:** Create stores, call with user_id=alice, verify path is .memory/alice/*, call with user_id=bob, verify separate namespace, query with alice, confirm bob's data is hidden, test legacy migration.

### `MEM-18` Implement memory garbage collection: auto-delete unreferenced provenance entries beyond retention window  ★ · M · missing

- **Reference:** hermes-agent/agent/curator.py: DEFAULT_ARCHIVE_AFTER_DAYS = 90, applies automatic transitions; curator_backup.py: keeps last N snapshots (default 5), older ones can be pruned
- **Muse approach:** Create packages/memory/src/memory-gc.ts: on curator schedule, scan belief-provenance-store for entries older than retention_days (default 180). Cross-check against active episodic-store and user-model-store: if the fact being referenced is no longer in those stores (deleted or explicitly superseded), mark provenance entry as 'unreferenced'. On second pass (next run), delete unreferenced entries older than retention_cutoff. Conservative approach: never aggressively prune, always keep 180d minimum, require double-confirmation before delete. Log deletions to .memory/gc-log.json for audit.
- **Value:** Prevents provenance store from growing unbounded in multi-year agents. Hermes curator includes archive/prune; Muse needs GC for operational sustainability.
- **Verify:** Create old provenance entries for deleted facts, run GC, verify unreferenced marking, confirm deletion only happens on second run, check gc-log records, verify active provenance is never deleted.

### `MEM-19` Implement context-scoped memory isolation: allow sub-agents to maintain separate episodic namespaces  ★ · M · missing

- **Reference:** hermes-agent/agent/memory_provider.py: on_delegation() hook observes subagent work, supports per-subagent scoping via agent_context parameter ('primary', 'subagent', 'cron', 'flush')
- **Muse approach:** Extend packages/memory/src/episodic-store.ts + packages/memory/src/memory-auto-extract.ts: add optional agent_id / agent_context parameter to all memory operations. When agent_id is set, episodic records are namespaced: .memory/episodic-<agent_id>.json. Auto-extract hook receives agent context, tags facts with origin agent_id. Recall preferentially returns same-agent episodic matches, with cross-agent as fallback (lower ranking). Subagent runs via multi-agent orchestrator automatically set agent_id to disambiguate.
- **Value:** Prevents subagent memory from polluting parent-agent context. Supports hierarchical multi-agent architectures. Hermes has this; Muse needs it for orchestrator scale.
- **Verify:** Create parent agent, spawn subagent, have both extract facts, verify episodic stores are separate, query from parent, confirm parent gets own memories first, test cross-agent recall fallback, verify subagent isolation is enforced.

## 4. Skills · Authoring · Bundles · Commands · Curation

_20 items_


### `SKL-1` Skill installation and marketplace: basic hub discovery (search multiple skill sources)  ★★★★★ · L · missing

- **Reference:** hermes-agent: tools/skills_hub.py + hermes_cli/skills_hub.py — unified_search() across official, skills.sh, GitHub, ClawHub, LobHub, and local skills with pagination, trust levels, and filtering
- **Muse approach:** Implement a `SkillSource` interface in `packages/skills/src/skill-source.ts` (inspect, fetch, list methods). Create adapters for GitHub (read SKILL.md from repo), agentskills.io API (JSON registry), and local filesystem. Add a `muse.skills.search` tool in `packages/tools/src/muse-tools-skills.ts` that queries sources in sequence (with timeout), returns paginated metadata (name, description, source, trust level). Store results in memory (no persistence yet).
- **Value:** Lets users discover skills from public repos and registries without manual GitHub browsing; foundation for future hub integration.
- **Verify:** Call muse.skills.search with query 'test', confirm results from at least 2 sources (github, local), each with name, description, trust_level.

### `SKL-2` Skill validation and risk scanning at author/install time (no prompt-injection)  ★★★★★ · M · partial

- **Reference:** Muse already has this for authored skills (scanSkillBodyForRisks in authored-skill-store.ts), but OpenClaw does it at install time via workshop + skill-workshop scan; hermes has tools/skills_guard.py content-hash scanning
- **Muse approach:** Extend the existing `scanSkillBodyForRisks` in `packages/skills/src/authored-skill-store.ts` to be called also for externally-installed skills (not just authored). Add a `validateSkillContent` function to `packages/skills/src/skill-validation.ts` (new file) that mirrors the OpenClaw scan: prompt-injection patterns (ignore/disregard/ignore instructions), dangerous shell (rm -rf, pipe to bash), embedded secrets (AWS keys, PEM headers). Call it in `muse.skills.install` before persisting to disk, quarantine flagged skills to .muse/skills/.quarantine/.
- **Value:** Prevents prompt-injection and credential leaks from untrusted external skills; quarantine+manual review keeps the agent safe without blocking all installs.
- **Verify:** Try to install a SKILL.md with 'ignore all previous instructions' in the body, confirm it's quarantined and not usable until manually reviewed.

### `SKL-3` Skill bundles (load N skills under one /command)  ★★★★ · M · missing

- **Reference:** hermes-agent: agent/skill_bundles.py — YAML manifest files in ~/.hermes/skill-bundles/*.yaml naming multiple skills to load as a unit, with conflict resolution (bundles override single skills), custom bundle instructions, and reporting of missing skills
- **Muse approach:** Implement a `SkillBundle` interface and loader in `packages/skills/src/skill-bundles.ts` mirroring Hermes's YAML-based manifest (bundle name, skills list, optional instruction). Store bundles in `~/.muse/skill-bundles/` alongside skills. Add `muse.skills.bundle` tool to invoke them. Register bundles in the autoconfigure layer at `packages/autoconfigure/src/skills-runtime.ts` alongside individual skills, with bundle-wins precedence in slash-command dispatch.
- **Value:** Enables power users to group related skills (e.g., 'backend-dev' = test + review + PR workflow) into single reusable commands, reducing cognitive load and copy-paste.
- **Verify:** Write a ~/.muse/skill-bundles/test-bundle.yaml, invoke via /test-bundle, confirm all 3 skills load with the bundle header note and optional bundle instruction appears.

### `SKL-4` Skill installation: 'muse skills install' from GitHub/registry with conflict resolution  ★★★★ · L · missing

- **Reference:** OpenClaw: docs/tools/skills.md + packages — 'openclaw skills install <slug>' from ClawHub, Git URL, or local path with SRI verification, update tracking, and conflict resolution (precedence levels)
- **Muse approach:** Add `muse.skills.install` tool (execute risk) in `packages/tools/src/muse-tools-skills.ts` that accepts a GitHub URL (e.g., 'owner/repo@ref:skills/skill-name'), agentskills.io identifier, or local path. Download the SKILL.md (via fetch or git), parse it, validate (no traversal, safe names), store in ~/.muse/skills/. Record the source/version in a .muse/skill-manifest.json for update tracking. Later roots (workspace) override earlier ones (user), matching `buildSkillRegistry` precedence.
- **Value:** Enables one-shot skill install without manual GitHub navigation or copy-paste; foundation for hub-driven skill ecosystem.
- **Verify:** Call install with a GitHub URL to a test SKILL.md in a public repo, confirm the skill appears in muse.skills.list and is runnable.

### `SKL-5` Skill preprocessing: template variable substitution (${HERMES_SKILL_DIR}, ${HERMES_SESSION_ID})  ★★★ · S · missing

- **Reference:** hermes-agent: agent/skill_preprocessing.py — substitute_template_vars() replaces ${HERMES_SKILL_DIR} and ${HERMES_SESSION_ID} in skill content so skills can reference their own directory and session context without hardcoding paths
- **Muse approach:** Add a `preprocessSkillContent()` function to `packages/skills/src/skill-parser.ts` that runs on skill load. Detect ${MUSE_SKILL_DIR} and ${MUSE_SESSION_ID} in the body, substitute when available (skill baseDir is known, session_id from context). Leave unresolved tokens in place for debugging. Apply this in the `createSkillReadTool` in `packages/tools/src/muse-tools-skills.ts` before returning the body.
- **Value:** Lets skill authors write `./scripts/setup.sh` as `${MUSE_SKILL_DIR}/scripts/setup.sh` so they work without absolute paths; session_id enables skill-specific logging or audit trails.
- **Verify:** Create a SKILL.md with body containing `Path: ${MUSE_SKILL_DIR}/templates`, read it via muse.skills.read, confirm the template path is substituted with the actual skill base directory.

### `SKL-6` Skill metadata: `platforms` field for OS-specific gating  ★★★ · S · missing

- **Reference:** hermes-agent: tools/skills_tool.py — SKILL.md frontmatter 'platforms: [macos, linux]' gates skills to specific OSes, filtered at load time; agentskills.io standard
- **Muse approach:** Add `platforms?: readonly string[]` to the `SkillFrontmatter` interface in `packages/skills/src/skill-contract.ts` (values: 'darwin', 'linux', 'win32'). Extend `FileSystemSkillLoader.loadAll()` in `packages/skills/src/skill-loader.ts` to skip skills whose platform list doesn't include `process.platform`. Document in the skill-parser JSDoc.
- **Value:** Prevents macOS-only CLI tools (e.g., osascript) from appearing on Linux, reducing agent confusion and failed tool invocations; mirrors Hermes/OpenClaw standard.
- **Verify:** Create a SKILL.md with 'platforms: [linux]' in frontmatter, load it on macOS, confirm it's filtered out of the registry.

### `SKL-7` Skill enable/disable per-agent via config (skills.entries.<name>.enabled flag)  ★★★ · M · missing

- **Reference:** OpenClaw: docs/tools/skills-config.md — skills.entries.<skill-name> section with 'enabled: true/false' to gate skills per agent, independent of location/precedence
- **Muse approach:** Add a 'skillsConfig' section to Muse's config system (e.g., env var `MUSE_SKILLS_CONFIG_JSON` or ~/.muse/skills-config.json with structure `{ entries: { '<skill-name>': { enabled: boolean } } }`). Extend `FileSystemSkillLoader.loadAll()` to filter by enabled status after loading. Update `muse.skills.list` to show enabled/disabled status. Gating is independent of precedence (workspace still overrides user even if user skill is disabled).
- **Value:** Lets users disable built-in or problematic skills without uninstalling them; useful for experimentation or per-workspace specialization.
- **Verify:** Disable 'research' skill via config, call muse.skills.list, confirm it's not in the list but still shows as disabled in a separate section.

### `SKL-8` Skill search and filtering: name, description, tags, and platforms in muse.skills.list output  ★★★ · M · partial

- **Reference:** hermes-agent: tools/skills_tool.py::skills_list() — returns paginated metadata; OpenClaw supports agent allowlists that filter which skills each agent sees
- **Muse approach:** Extend `muse.skills.list` in `packages/tools/src/muse-tools-skills.ts` to accept optional filters: `query` (searches name + description), `tags` (array, any-match), `requiresBins` (exact match on binary), `platforms` (exact match on platform). Return paginated results (100 skills per page). Document that filtering is client-side (skills registry returns full list, tool does the filtering).
- **Value:** Enables the agent to find skills by capability ('show me testing skills') without manual catalog browsing or remembering exact names.
- **Verify:** Call muse.skills.list with query='test' and tags=['testing'], confirm only skills matching both criteria return.

### `SKL-9` Skill preprocessing: inline shell command execution (!`cmd` → stdout)  ★★ · M · missing

- **Reference:** hermes-agent: agent/skill_preprocessing.py — expand_inline_shell() runs !`cmd` snippets at skill load time (e.g., !`git version` → '2.43.0'), with stdout capture, error handling, and output capping (4KB max)
- **Muse approach:** Extend `packages/skills/src/skill-parser.ts` with an `expandInlineShell()` function that detects `!\`...\`` patterns, spawns them via `node:child_process` with the skill dir as cwd, captures output (16KB cap to match muse.skills.run), and substitutes. Gate it behind a config flag `MUSE_SKILL_INLINE_SHELL` (default false) to prevent untrusted skill execution. Run after template-var substitution in `createSkillReadTool`.
- **Value:** Enables dynamic skill content: e.g., '!`ls ./templates`' auto-populates the list of available templates, keeping skills DRY and reducing copy-paste maintenance burden.
- **Verify:** Create a SKILL.md with body '!`echo hello world`', read it via muse.skills.read with MUSE_SKILL_INLINE_SHELL=true, confirm output shows 'hello world' in place of the snippet.

### `SKL-10` Skill metadata: `tags` field for categorization and search  ★★ · S · missing

- **Reference:** hermes-agent: tools/skills_tool.py — SKILL.md metadata.hermes.tags field for categorization (fine-tuning, llm, etc.); used by search and discovery
- **Muse approach:** Add `tags?: readonly string[]` to `SkillFrontmatter` in `packages/skills/src/skill-contract.ts`. Expose tags in `muse.skills.list` output. Add optional `tags` filter to `muse.skills.list` input schema (e.g., 'list skills tagged with workflow'). Filter implementation in `packages/tools/src/muse-tools-skills.ts`.
- **Value:** Enables domain-aware skill discovery without marketplace backend: user/LLM can filter skills by intent ('testing', 'web-scrape', 'auth') without naming exact skills.
- **Verify:** Add tags to 2 skills ('testing' and 'web'), call muse.skills.list with tags filter for 'testing', confirm only the testing skill returns.

### `SKL-11` Skill authoring: session-aware skill capture and consolidation (curator loop)  ★★ · M · partial

- **Reference:** Muse already has authored-skill-store.ts with authoring + consolidation, but Hermes has curator lifecycle (skill_bundles.py, tools) with auto-archive of stale skills and periodic consolidation runs (SkillOpt umbrella merging with validation gates)
- **Muse approach:** Extend `AuthoredSkillStore` in `packages/skills/src/authored-skill-store.ts` with a `curateAutomated()` method (already has `curate()` for archival). Wire it into agent-core's session-end hook so it runs after every N turns (configurable, default 50). Consolidate via the existing `consolidate()` method with feedback-retry and validation gates. Add a `muse.skills.curator-status` tool to show queued consolidations and archived skills (read-only, for observability).
- **Value:** Keeps authored skills fresh and non-redundant without manual curation burden; prevents skill library bloat on long-running agents.
- **Verify:** Author 2 similar skills, run curator with consolidation, confirm they're merged into 1 umbrella skill and the originals are archived.

### `SKL-12` Skill config injection: resolve metadata.hermes.config values and inject into prompt  ★★ · M · missing

- **Reference:** hermes-agent: agent/skill_commands.py::_inject_skill_config() — skills declare metadata.hermes.config keys (e.g., ['browser.enabled']), these are resolved from config.yaml and injected into the skill message so the agent knows the values
- **Muse approach:** Extend `SkillFrontmatter` to include `config?: readonly string[]` (optional array of config key names). In `packages/tools/src/muse-tools-skills.ts`, extend `createSkillReadTool` to look up config keys (from `MUSE_CONFIG_*` env vars or a future config provider) and append a '[Skill config: ...]' block before returning the body. Document that config keys are resolved best-effort (missing keys are noted as '(not set)').
- **Value:** Lets skills declare runtime dependencies on config values without hardcoding them; the agent sees the current values in the prompt.
- **Verify:** Author a SKILL.md declaring metadata.muse.config = ['browser.enabled'], set MUSE_CONFIG_BROWSER_ENABLED=true, read the skill, confirm the config block shows 'browser.enabled = true'.

### `SKL-13` Skill rewards and usage tracking (leverage skill-rewards-store)  ★★ · M · partial

- **Reference:** Muse has skill-rewards-store but it's not integrated into skill-tools or usage tracking; Hermes has tools/skill_usage.py that bumps usage counters, feeds curator priority
- **Muse approach:** Wire the existing `skill-rewards-store` (`packages/stores/src/skill-rewards-store.ts`) into `createSkillReadTool` and `createSkillRunTool` in `packages/tools/src/muse-tools-skills.ts` so every read/run increments a usage counter for that skill. Also update `AuthoredSkillStore.recordUsage()` to persist lastUsedAt in the skill metadata (already done). Export usage stats via a new `muse.skills.usage-stats` tool (read-only).
- **Value:** Feeds the curator with usage data to rank skills by utility (never-used older skills archived before frequently-used ones); enables future analytics on which skills are actually valuable.
- **Verify:** Read a skill 3 times, call usage-stats, confirm read count = 3 for that skill.

### `SKL-14` Skill metadata: `version` and `homepage` for provenance tracking  ★ · S · partial

- **Reference:** hermes-agent: tools/skills_tool.py + OpenClaw docs — optional 'version: 1.0.0' and agentskills.io-standard 'homepage' for skill provenance and update checks; tracked in lock files
- **Muse approach:** Add `version?: string` and `homepage?: string` to `SkillFrontmatter` in `packages/skills/src/skill-contract.ts`. Update the skill-loader to log version mismatches when reloading (warn if version changed since last load, useful for external skill sources). Store version in skill-rewards-store or a new .muse/skill-manifest.json for future update checks.
- **Value:** Tracks which version of an external/hub skill is installed, enabling future update notifications; homepage enables skill authors to point to docs.
- **Verify:** Add version: 1.0.0 to a SKILL.md, reload the skill, check that the registry entry includes version and it's logged as loaded.

### `SKL-15` Skill directory context injection: ${MUSE_SKILL_DIR} and relative-path hints in prompts  ★ · S · partial

- **Reference:** hermes-agent: agent/skill_commands.py::_build_skill_message() — appends '[Skill directory: /path/to/skill] Resolve any relative paths...' so the agent can run skill-bundled scripts via absolute paths
- **Muse approach:** Extend `createSkillReadTool` in `packages/tools/src/muse-tools-skills.ts` to always append a '[Skill directory: <baseDir>]' hint after the body, explaining that relative paths in the skill refer to that directory. This mirrors the template-var substitution: skill authors can write './templates/config.yaml' and the agent learns it means '<baseDir>/templates/config.yaml'.
- **Value:** Clarifies to the agent how to resolve skill-relative paths, preventing confusion and enabling skills that reference bundled templates/scripts without absolute paths.
- **Verify:** Read a skill with a relative path './scripts/setup.sh' in the body, confirm the skill directory hint appears below the content.

### `SKL-16` Slash-command slash-completion: /skill-name autocomplete and discovery in TUI/CLI  ★ · S · missing

- **Reference:** hermes-agent: agent/skill_commands.py + CLI integration — Telegram/CLI resolves slash commands by normalizing skill names (hyphen/underscore interchangeability), falling back to bundles
- **Muse approach:** Add logic to `packages/skills/src/skill-registry.ts` to support slug-based lookup (e.g., 'my-skill', 'my_skill', 'MySkill' all resolve to the same skill). Extend `muse.skills.read` to accept either the full name or the slug. Export a `resolveSkillSlug()` function for use in TUI/CLI integration. Document that `/my-skill`, `/my_skill`, `/myskill` are equivalent.
- **Value:** Reduces friction in TUI usage where typos or case-sensitivity matter; mirrors Telegram bot slash-command flexibility.
- **Verify:** Create a skill named 'my-skill', call muse.skills.read with 'my_skill', confirm it resolves to the same skill.

### `SKL-17` Skill composition and nesting: call other skills from within a skill body  ★ · S · missing

- **Reference:** OpenClaw: agent-core/harness/skills.ts — skills are formatted as XML blocks; nested calls could invoke other skills via tool calls (implicit via agent loop, not explicit yet)
- **Muse approach:** Add a note to the skill body formatting (in `createSkillReadTool`) documenting how to call other skills: 'You can call muse.skills.read to load another skill's content, then muse.skills.run to invoke it. Skills are composable — use read to check prerequisites.' No code change needed — this is documentation + convention. Later, if needed, add explicit `muse.skills.call(skillName, ...)` that executes the skill in-band (not via tool call).
- **Value:** Enables power-user skills that orchestrate simpler primitives (e.g., a 'full-test' skill that calls 'unit-test', 'lint', 'integration-test' in sequence).
- **Verify:** Document in skill-tools README that calling other skills is done via explicit muse.skills.read + muse.skills.run calls, demonstrate with a composite skill that calls 2 others.

### `SKL-18` Skill migration/versioning: upgrade path when skill structure changes  ★ · S · missing

- **Reference:** OpenClaw: docs mention skill format evolution; Hermes handles bundled vs. user versions via sync manifest tracking user-modified state
- **Muse approach:** Add a `schemaVersion: '1'` field to `SkillFrontmatter` (defaults to '1'). When loading, check if schema > current support and log a warning (fail-open, don't block). In future if SKILL.md format changes (e.g., 'requires' → 'metadata.muse.requires'), the version field lets loaders coexist. For now, document in the skill-contract that version 1 is current and expected.
- **Value:** Future-proofs the skill format; when/if we need to evolve SKILL.md structure, existing skills can be auto-migrated or marked as deprecated.
- **Verify:** Create a SKILL.md with schemaVersion: '2', load it, confirm a warning is logged but the skill still loads (fail-open).

### `SKL-19` Skill permissions and allowlists: per-agent skill visibility (no global access)  ★ · M · missing

- **Reference:** OpenClaw: docs/tools/skills.md — agents.defaults.skills and agents.list[].skills allowlists restrict which skills each agent can see, independent of location/precedence
- **Muse approach:** Add an optional `skillAllowlist?: readonly string[]` to the agent config (future work: this would live in a Muse agents config file, not present yet). In `buildSkillRegistry`, filter skills at list time: if allowlist is set, only return skills whose names are in the list. Implement as a wrapper `SkillRegistry` that filters on reads. Default (no allowlist) = all skills visible.
- **Value:** In multi-agent setups, lock down agents to specific skills (e.g., 'docwriter' agent can't see 'database-migration' skill). Prevents accidental tool use across agent personas.
- **Verify:** Set a skill allowlist for an agent, load that agent, confirm muse.skills.list only returns allowed skills.

### `SKL-20` Skill performance profiling: track execution time and failures per skill  ★ · M · missing

- **Reference:** hermes-agent: tools/skill_usage.py — usage counters; no explicit perf profiling but framework exists for extending
- **Muse approach:** Extend the skill-rewards-store to track (in addition to usage count): execution time (ms), success/failure flags, and error message (first 200 chars). In `createSkillRunTool`, wrap execution with timing and outcome recording. Export via `muse.skills.performance-stats` (read-only) showing slowest, most-failed skills. Data persists in the rewards store.
- **Value:** Identifies skills that are slow or flaky (e.g., external API timeouts), helping prioritize optimization or debugging.
- **Verify:** Run a skill that takes 5+ seconds, call performance-stats, confirm execution time is recorded and the skill shows as slowest.

## 5. Tool Execution · Guardrails · File Safety · Net Policy · Secrets

_16 items_


### `TSF-1` Implement deterministic URL secret redaction in tool results and logs  ★★★★★ · M · partial

- **Reference:** openclaw: packages/net-policy/src/redact-sensitive-url.ts — redactSensitiveUrl() redacts query params and userinfo from parsed URLs
- **Muse approach:** Add a @muse/net-policy package with URL redaction matching openclaw's sensitive query parameter names (token, api_key, secret, etc.) and redact both userinfo and sensitive query params. Land in packages/net-policy/src/url-redaction.ts; export via @muse/policy for use in observability/logging layers. Deterministic, not prompt-based.
- **Value:** Prevents API keys and OAuth tokens in URLs from leaking into logs and model context when tools emit them in outputs or error messages.
- **Verify:** Test that https://api.example.com?api_key=sk-abc123 redacts to https://api.example.com?api_key=*** in tool result logs.

### `TSF-2` Implement tool-loop guardrail with repeated failure detection  ★★★★★ · L · missing

- **Reference:** hermes: agent/tool_guardrails.py — ToolCallGuardrailController tracks exact_failure_counts, same_tool_failure_counts, idempotent_tool tracking, config-driven warn/block thresholds
- **Muse approach:** Add tool-loop guardrail to @muse/agent-core. Create ToolLoopGuard class that tracks per-signature call hashes and result hashes, counts exact/same-tool failures, warns after N failures, blocks after M. Distinguish idempotent (read_file) vs mutating (write_file) tools. Land in packages/agent-core/src/tool-loop-guard.ts. Integrate into guard-pipeline.ts.
- **Value:** Detects when the agent is stuck retrying the same tool call with identical arguments or the same tool failing repeatedly without changing strategy.
- **Verify:** After 5 identical read_file calls returning the same result, guardrail warns; after 8 same_tool failures, it blocks.

### `TSF-3` Implement redaction of secrets in tool output and logs (prefix-based + patterns)  ★★★★★ · M · partial

- **Reference:** hermes: agent/redact.py — redact_sensitive_text() masks sk-*, ghp_*, gho_*, xox-*, AIza*, JWTs (eyJ*), auth headers, DB connstrings, private keys, form bodies, URLs with query secrets
- **Muse approach:** Enhance @muse/policy redaction. Add comprehensive secret pattern library (vendor prefixes: sk-, ghp_, npm_, pypi-, etc.; JWT eyJ*; auth headers; DB connstrings; private keys). Implement redact_sensitive_text(text, force?, code_file?) with cheap substring pre-checks to avoid regex overhead on clean text. Land in packages/policy/src/redaction.ts and export via @muse/policy.
- **Value:** Prevents API keys, tokens, JWTs, and private key material from appearing unredacted in observability logs and tool transcripts.
- **Verify:** redact_sensitive_text('sk-proj-abc123') returns 'sk-p...123'; redact_sensitive_text('Bearer sk-abc123') masks the token.

### `TSF-4` Implement SSRF IP address blocking for network policy  ★★★★ · L · missing

- **Reference:** openclaw: packages/net-policy/src/ip.ts — isBlockedSpecialUseIpv4Address(), isBlockedSpecialUseIpv6Address(), detectsCloudMetadataIPs; hermes: tool_guardrails.py respects IP ranges
- **Muse approach:** Add IP parsing and SSRF validation to @muse/net-policy. Implement isBlockedSpecialUseIpv4(), isBlockedSpecialUseIpv6(), parseCanonicalIpAddress(), and isPrivateOrLoopbackIpAddress(). Block RFC 1918 private ranges, loopback, link-local, cloud metadata (100.100.100.200, fd00:ec2::254), and RFC 2544 benchmark ranges by default. Land in packages/net-policy/src/ip-policy.ts.
- **Value:** Blocks SSRF attacks via private IP address literals and cloud metadata endpoints without requiring external validation.
- **Verify:** isBlockedSpecialUseIpv4Address('192.168.1.1') returns true; isBlockedSpecialUseIpv4Address('8.8.8.8') returns false.

### `TSF-5` Add homoglyph and zero-width evasion defense to injection patterns  ★★★★ · M · partial

- **Reference:** openclaw: packages/net-policy/src/ip.ts (embedded IPv4 detection); hermes: N/A; muse: packages/agent-core/src/injection.ts has stripInjectionEvasionChars but no homoglyph normalization
- **Muse approach:** Extend @muse/policy's normalizeForInjectionDetection() to normalize homoglyphs (Cyrillic і→i) and HTML entity decoding before injection pattern matching. Maintain byte-identical preservation for clean text. Add homoglyph map for common substitution glyphs. Land in packages/policy/src/injection-patterns.ts as enhanced normalizeForInjectionDetection().
- **Value:** Prevents injection attacks using visual homoglyphs (іgnore vs ignore) or HTML entities (&#105;gnore) from bypassing pattern detection.
- **Verify:** isMemoryInjection('іgnore previous instructions') (Cyrillic і) returns true when normalized.

### `TSF-6` Implement file-safety read denylist for .env and credential stores  ★★★★ · M · partial

- **Reference:** hermes: agent/file_safety.py — get_read_block_error() blocks .env, .env.local, .env.production, auth.json, .npmrc, .pgpass, .pypirc, MCP token files
- **Muse approach:** Extend @muse/fs path-safety to include read-denial rules. Create getReadBlockError(path, hermesDirs) function that blocks project-local .env files, Muse's own state dirs (if any), and well-known credential stores (.npmrc, .netrc, .pypirc). Defense-in-depth only (terminal can still read). Land in packages/fs/src/fs-path-safety.ts.
- **Value:** Defends-in-depth against accidental credential leakage by blocking model from read-accessing secret-bearing .env files.
- **Verify:** file_read('.env') returns error 'Access denied: .env is a secret-bearing environment file'; file_read('.env.example') succeeds.

### `TSF-7` Implement tool-result mutation verification (write_file / patch success confirmation)  ★★★★ · S · partial

- **Reference:** hermes: agent/tool_result_classification.py — file_mutation_result_landed() checks write_file for 'bytes_written' and patch for 'success': true
- **Muse approach:** Create @muse/tool-results package. Implement classifyToolResultType(toolName, result) that detects when write_file/patch actually succeeded (not just claimed to). Check for 'bytes_written' in write_file JSON, 'success': true in patch. Use for guardrail loop detection and verifier feedback. Land in packages/tool-results/src/result-classification.ts.
- **Value:** Distinguishes between tool claims of success and actual filesystem mutations, preventing false-done-reprompt and guardrail evasion via fabricated success messages.
- **Verify:** file_mutation_result_landed('write_file', '{"bytes_written": 100}') returns true; file_mutation_result_landed('write_file', '{"error": "..."}) returns false.

### `TSF-8` Implement concurrent tool execution with interrupt handling  ★★★★ · L · partial

- **Reference:** hermes: agent/tool_executor.py — execute_tool_calls_concurrent() uses ThreadPoolExecutor, thread-local interrupts, per-thread activity callbacks, heartbeat loop
- **Muse approach:** Enhance @muse/executor concurrent path (likely exists but incomplete). Implement thread-based concurrent tool execution with: (1) per-thread interrupt flags propagated to workers, (2) thread-local activity callbacks for long-running tools, (3) periodic heartbeat loop (5s intervals) to prevent gateway inactivity timeout, (4) graceful cancellation of pending futures on user interrupt. Land in crates/executor/src/concurrent.rs or packages/executor if TypeScript-based.
- **Value:** Executes multiple independent tools in parallel while respecting user interrupts and keeping the gateway informed of progress on long-running batches.
- **Verify:** Run 5 tools concurrently; mid-execution, send interrupt signal; verify remaining futures cancel gracefully within 3 seconds.

### `TSF-9` Add profile-scoped secret resolution (multi-profile credential isolation)  ★★★ · M · missing

- **Reference:** hermes: agent/secret_scope.py — set_secret_scope() + get_secret() enforce per-profile .env isolation via contextvars; fail-close when multiplexing active
- **Muse approach:** Create @muse/secret-scope package. Implement context-var-based secret scope that stores per-profile .env mappings. Add set_secret_scope(secrets), get_secret(name, default), and load_env_file(path). Mark genuinely-global env vars (PATH, HOME, LANG) as exempt. When multiplexing active, fail-close on unscoped reads. Land in packages/secret-scope/src/index.ts.
- **Value:** Isolates credentials across concurrent multi-profile Muse sessions, preventing profile A's API keys from leaking to profile B's agent runs.
- **Verify:** When multiplexing active and no scope set, get_secret('OPENAI_API_KEY') throws UnscopedSecretError; with scope set returns from scope dict.

### `TSF-10` Implement SSL CA certificate pre-validation on startup  ★★★ · S · missing

- **Reference:** hermes: agent/ssl_guard.py — verify_ca_bundle() checks HERMES_CA_BUNDLE / SSL_CERT_FILE / certifi before any HTTPS call, with user-actionable error messages
- **Muse approach:** Add SSL validation to @muse/env or @muse/runtime startup. Create verifyCABundle() function that checks MUSE_CA_BUNDLE, SSL_CERT_FILE env vars and Node's certifi equivalent; validate file exists, is readable, and loads without errors. Call at runtime init before any outbound network. Land in packages/runtime/src/ssl-guard.ts.
- **Value:** Detects broken CA bundle configuration before the first HTTPS request fails cryptically, providing users with clear repair instructions.
- **Verify:** When SSL_CERT_FILE=/broken/path, verifyCABundle() throws SSLConfigurationError with repair hint before runtime starts.

### `TSF-11` Implement deterministic shell-command destructiveness detection  ★★★ · M · missing

- **Reference:** hermes: agent/tool_dispatch_helpers.py — _is_destructive_command() detects rm, rmdir, git reset --hard, truncate, format-disk commands for pre-checkpoint
- **Muse approach:** Add shell command classification to @muse/shell or @muse/runner. Create isDestructiveCommand(cmdString) that identifies rm, rmdir, git reset, git clean, truncate, dd, format-disk, mkfs patterns. Use for pre-checkpoint decision in concurrent/sequential tool execution. Land in packages/runner/src/destructiveness-check.ts or crates/runner/src/destructiveness.rs.
- **Value:** Automatically checkpoints the workspace before executing destructive commands, enabling rollback if the agent mistakenly runs rm -rf or similar.
- **Verify:** isDestructiveCommand('rm -rf /') returns true; isDestructiveCommand('rm -rf src/old/') returns true; isDestructiveCommand('cat file.txt') returns false.

### `TSF-12` Implement tool middleware / pre-tool-call plugin system  ★★★ · M · missing

- **Reference:** hermes: agent/tool_executor.py — _apply_tool_request_middleware_for_agent() pre-processes args before execution; hermes_cli/plugins get_pre_tool_call_block_message() allows external blocks
- **Muse approach:** Add middleware pipeline to @muse/agent-core tool execution. Create ToolRequestMiddleware interface (before_call hook that can modify args, trace decisions). Register middleware in AgentRuntime. Integrate into executor's tool-call dispatch so each tool call passes through middleware chain before execution. Land in packages/agent-core/src/tool-middleware.ts. Wire into tool executor.
- **Value:** Allows external systems (auditing, compliance, custom guardrails) to inspect/modify tool arguments before execution without embedding logic in core.
- **Verify:** Middleware can set request middleware trace; tool executor includes trace in post_tool_call observability events.

### `TSF-13` Implement tool-output message content type detection for multimodal handling  ★★★ · S · partial

- **Reference:** hermes: agent/tool_dispatch_helpers.py — _is_multimodal_tool_result() detects image/vision results; unwraps dicts to OpenAI-style content lists
- **Muse approach:** Add multimodal tool-result handling to @muse/agent-core. Create isMultimodalToolResult(result) that detects presence of image/vision data in tool output. Implement unwrapMultimodalContent(result) that converts internal _multimodal dict format to OpenAI-style [{type: 'text'}, {type: 'image_url'}] for vision-capable providers. Land in packages/agent-core/src/tool-result-unwrap.ts.
- **Value:** Transparently handles image-based tool results (file_read on images, browser screenshots) and sends them to vision-capable models without requiring model-specific wrapper code.
- **Verify:** isMultimodalToolResult({_multimodal: true, blocks: [{type: 'image_base64', ...}]}) returns true; models receive [{type: 'text'}, {type: 'image_url'}] format.

### `TSF-14` Implement budget-enforced tool-output truncation per turn  ★★★ · M · missing

- **Reference:** hermes: tools/tool_result_storage.py — enforce_turn_budget() sums all tool-result content for the turn and truncates if over context budget
- **Muse approach:** Add tool-result budgeting to @muse/agent-core. Create BudgetConfig with max_single_result_chars and max_turn_total_chars. Implement enforceToolResultBudget(messages, budget) that sums tool-result message lengths and truncates with 'next_offset' hint if over limit. Call after every tool result collection. Land in packages/agent-core/src/tool-result-budget.ts.
- **Value:** Prevents a single large tool result or many results in one turn from consuming the entire context window, forcing useful conversation to be truncated.
- **Verify:** With budget=50k, 10 tools returning 10k each truncates the 10th result with nextOffset hint.

### `TSF-15` Implement cross-profile write guard (soft boundary for multi-profile isolation)  ★★ · M · missing

- **Reference:** hermes: agent/file_safety.py — classify_cross_profile_target() and get_cross_profile_warning() soft-guard writes to other profiles' skills/plugins/cron/memories
- **Muse approach:** Add profile-aware write guard to @muse/fs. Create classifyCrossProfileTarget(path, activeProfileName) that detects writes to ~/.muse/profiles/<other-name>/skills etc. Return warning dict with active/target profile names. Defense-in-depth (agent can still write with explicit consent). Land in packages/fs/src/fs-path-safety.ts alongside read-denylist.
- **Value:** Prevents accidental cross-profile pollution by warning when the agent tries to write to another Muse profile's state directories.
- **Verify:** Detect ~/.muse/profiles/other-profile/skills/foo.ts and return warning with active_profile and target_profile.

### `TSF-16` Implement CIDR range checking for IP allowlist/denylist rules  ★★ · M · missing

- **Reference:** openclaw: packages/net-policy/src/ip.ts — isIpInCidr(ip, cidr) parses CIDR notation and matches IPs against ranges
- **Muse approach:** Extend @muse/net-policy IP support. Implement isIpInCidr(ip: string, cidr: string) that parses CIDR ranges (e.g., 192.168.0.0/16) and checks if an IP literal matches. Support both IPv4 and IPv6. Use for per-deployment network policy rules (e.g., allow only certain AWS regions by IP block). Land in packages/net-policy/src/ip-policy.ts.
- **Value:** Enables fine-grained network policy (allowlist/denylist by CIDR blocks) without hardcoding individual IPs.
- **Verify:** isIpInCidr('192.168.1.50', '192.168.0.0/16') returns true; isIpInCidr('10.0.0.1', '192.168.0.0/16') returns false.

## 6. Reliability · Retry · Error Classification · Rate Limit · Budgets

_17 items_


### `REL-1` Implement API error classifier with priority-ordered taxonomy  ★★★★★ · L · missing

- **Reference:** hermes-agent/agent/error_classifier.py — 1366-line FailoverReason enum + classify_api_error() pipeline with 40+ pattern categories (auth, billing, rate_limit, context_overflow, provider-specific) and recovery hints (retryable, should_compress, should_rotate_credential, should_fallback)
- **Muse approach:** Create packages/resilience/src/error-classifier.ts implementing a structured FailoverReason enum (auth, billing, rate_limit, context_overflow, timeout, server_error, format_error, model_not_found) and classify() function that applies a priority-ordered pipeline: status code + message pattern matching → error code classification → transport error heuristics. Recovery hints (retryable, shouldCompress, shouldRotateCredential) guide the retry loop. Local-model constraint: patterns are deterministic regex/string matches, no LLM-based heuristics.
- **Value:** Enables smart recovery decisions (retry vs fallback vs compression vs fail-fast) per error type, eliminating retry amplification when rate limits / billing hits occur. Reduces wasted token spend by routing non-retryable errors (bad API key, model-not-found) to fallback immediately.
- **Verify:** Unit test classify() against 50+ synthetic error shapes (401/403/402/429/400/413/5xx, including wrapped OpenRouter errors, Anthropic thinking sigs, llama.cpp grammar rejections). Verify retryable/shouldCompress/shouldRotateCredential flags are set correctly per error reason.

### `REL-2` Add jittered exponential backoff with concurrent session decorrelation  ★★★★ · M · partial

- **Reference:** hermes-agent/agent/retry_utils.py — jittered_backoff() uses decorrelated jitter (base * 2^(attempt-1) + uniform jitter) seeded from time_ns() ^ counter to prevent thundering herd when multiple sessions hit same provider concurrently
- **Muse approach:** Enhance packages/resilience/src/index.ts retry policy to include jitter-aware backoff. Add decorrelatedJitterBackoff() function that computes delay = min(base * 2^(attempt-1), maxDelay) + jitter, where jitter = uniform(0, jitterRatio * delay). Seed the RNG from monotonic counter + time to avoid retry spikes when multiple agents retry same provider. Named export so callers can use it in custom retry loops.
- **Value:** Prevents retry spikes that exhaust per-minute rate limits even faster. With multiple Muse instances or background tasks, jitter prevents synchronized retry bursts that knock the provider offline further.
- **Verify:** Generate 100 backoff sequences across 10 parallel simulated retries, verify jitter spreads delays uniformly (no clustering), and max delay never exceeds configured cap. Test cross-process seed uniqueness by simulating time collisions.

### `REL-3` Per-turn recovery state tracker with one-shot guards  ★★★★ · M · missing

- **Reference:** hermes-agent/agent/turn_retry_state.py — TurnRetryState dataclass with 16+ one-shot booleans (codex_auth_retry_attempted, thinking_sig_retry_attempted, etc.) preventing duplicate recovery attempts on same API call
- **Muse approach:** Create packages/agent-core/src/turn-retry-state.ts with TurnRetryState interface tracking per-provider auth retries (codex, anthropic, nous), format-recovery attempts (thinking-sig stripping, multimodal-tool-content downgrade, image shrink, grammar fallback), and restart signals (compressed_messages, length_continuation). One instance per API call attempt. Guards are plain booleans checked before each recovery branch fires.
- **Value:** Prevents redundant recovery attempts (e.g., stripping thinking blocks twice on same turn) that waste tokens and confuse debugging logs. Makes recovery bookkeeping explicit and testable instead of threaded through 2000+ lines of loop code.
- **Verify:** Verify each guard boolean defaults false, fires recovery exactly once per turn, and resets fresh on next API call attempt. Test with a sequence of errors (thinking-sig + image-too-large) that would trigger multiple guards; confirm no double-execution.

### `REL-4` Capture and parse rate-limit headers (x-ratelimit-* standard)  ★★★ · M · missing

- **Reference:** hermes-agent/agent/rate_limit_tracker.py — parse_rate_limit_headers() extracts 12 headers (limit/remaining/reset per minute/hour for requests/tokens) and formats display with ASCII progress bar and reset countdown.
- **Muse approach:** Create packages/resilience/src/rate-limit-tracker.ts with RateLimitBucket (limit, remaining, resetSeconds, capturedAt) and RateLimitState (requests_min, requests_hour, tokens_min, tokens_hour). Export parseRateLimitHeaders(headers, provider) that normalizes header keys to lowercase (HTTP headers are case-insensitive) and extracts integers. Add formatRateLimitDisplay() for CLI/observability output. Hook into model provider stream result to capture headers after each call.
- **Value:** Operators can monitor when approaching hard limits and preemptively pause runs. Enables rate-limit-aware scheduling — don't start a 10M-token run when only 2M TPH remains.
- **Verify:** Parse mock headers with mixed case (X-RateLimit-Limit-Tokens vs x-ratelimit-limit-tokens), verify reset countdown adjusts for elapsed time (capturedAt), format output contains usage %, remaining tokens, reset time in human-friendly units (M/K for counts, h/m/s for durations).

### `REL-5` Implement per-agent iteration budget with thread-safe consume/refund  ★★★ · M · missing

- **Reference:** hermes-agent/agent/iteration_budget.py — IterationBudget with consume() / refund() for parent (90 iter default) and subagents (50 iter default), refunds execute_code turns so they don't count toward limit
- **Muse approach:** Create packages/observability/src/iteration-budget.ts with IterationBudget class (max_total: number, private _used, thread-safe via mutex-like lock). Export consume(): bool (returns true if iteration allowed; increments counter), refund(): void for delegated tool calls. Parent agent initialized with max_total=90, subagents with max_total=50 (configurable). Hook into AgentRuntime.run() between tool iterations.
- **Value:** Prevents runaway loops (infinite tool calls). Subagent budgets prevent a delegated task from starving parent. Refund path for execute_code keeps low-level tool batches lean (they shouldn't consume iteration budget if the parent is driving orchestration).
- **Verify:** consume() returns true 90 times then false; refund() decrements counter; test concurrent consume from two threads (use lock/atomic semantics). Verify subagent gets independent 50-budget instance.

### `REL-6` Implement context compression trigger and API  ★★★ · M · partial

- **Reference:** hermes-agent/agent/error_classifier.py — classify_api_error() returns should_compress=True for context_overflow / long_context_tier / payload_too_large / server_disconnect+large_session, which triggers compression loop in run_agent.py
- **Muse approach:** Extend packages/memory/src/memory-token-trim.ts to export async compressContext(messages, targetTokens): Promise<Message[]> that applies message importance trimming + system-instruction elision until under budget. Call from model-loop retry logic when classified error has should_compress=True. Pass approx_tokens + context_length to error classifier so it can detect 'large session' heuristic (>60% of window or >120k tokens for small-context models).
- **Value:** When a model returns 413 or context-overflow 400, automatically shrink the turn's message history instead of failing. Recovers requests that would otherwise require manual truncation.
- **Verify:** Send request at 95% context fill; trigger 400 context-overflow error; verify compressContext() is called, message count decreases, retried request fits within limit. Test that generic 400 + large session heuristic correctly identifies overflow vs other 400 reasons.

### `REL-7` Add retry policy for provider-credential rotation  ★★ · M · partial

- **Reference:** hermes-agent/agent/turn_retry_state.py (lines 42-47) + hermes's run_agent.py retry loop — per-provider OAuth refresh (codex, anthropic, nous) runs once before escalating to fallback
- **Muse approach:** Extend packages/model/src/model-provider.ts or create packages/resilience/src/credential-rotator.ts to define CredentialRotationStrategy interface (rotateCredential(provider, model): Promise<boolean>). Update retry loop in agent-core to check classified error's should_rotate_credential flag and attempt rotation before retry. Support Anthropic native, OpenAI, Gemini refresh flows. Only attempt once per API call (tracked in TurnRetryState).
- **Value:** When a provider's API token expires mid-session, automatic refresh prevents the turn from hard-failing — instead it re-authenticates and retries transparently. Reduces user confusion and manual re-auth prompts.
- **Verify:** Inject a mock CredentialRotationStrategy that succeeds once then fails; verify retry happens after rotation and uses new credential. Test that rotation is only attempted once even if multiple retries needed.

### `REL-8` Add provider-specific error pattern library (pluggable)  ★★ · M · missing

- **Reference:** hermes-agent/agent/error_classifier.py — 300+ pattern lists (lines 96-436) including provider-specific wording: Anthropic thinking sigs, llama.cpp grammar errors, OpenRouter policy blocks, xAI Grok entitlements, AWS Bedrock context-length patterns, Chinese error messages
- **Muse approach:** Create packages/resilience/src/error-patterns.ts with exported pattern lists (BILLING_PATTERNS, RATE_LIMIT_PATTERNS, CONTEXT_OVERFLOW_PATTERNS, etc.) and provider-specific overrides as a map: Map<provider, patterns>. Let error-classifier.classify() pull from base patterns + provider-specific entries. Pre-seed with Ollama/llama.cpp patterns (local-first priority), OpenAI, Anthropic, Gemini. Make pluggable via registerErrorPatterns(provider, patterns) for future extensibility.
- **Value:** Keeps error messages up-to-date as providers change their wording without modifying the classifier. New provider integrations can register patterns immediately.
- **Verify:** Register Ollama-specific context patterns; send a Ollama context-overflow error; verify it classifies as context_overflow not unknown. Test that provider-specific patterns override base patterns when provider is set.

### `REL-9` Implement turn finalizer for post-attempt bookkeeping  ★★ · M · missing

- **Reference:** hermes-agent/agent/turn_finalizer.py — post-attempt cleanup: record final error reason, mark turn as exhausted vs recoverable, emit structured diagnostics
- **Muse approach:** Create packages/agent-core/src/turn-finalizer.ts with finalizeTurn(context, attempt, result, error) callback. Called after each API call attempt (success or failure). Records: final error reason, recovery path taken (auth refresh / fallback / compression / retry), attempt count, token usage deltas. Emits to observability sink (observability-slo-alert, budget-tracker, agent-metrics). No user-facing output — purely internal bookkeeping.
- **Value:** Operators can query: 'how many turns failed due to rate limits vs auth vs model-not-found?' Enables targeted debugging and cost analysis.
- **Verify:** Send sequence: (success), (429 rate-limit+fallback succeeds), (401 auth+retry succeeds), (400 format-error non-retryable). Verify turn-finalizer records reason, recovery path, and metrics for each. Test observability hooks are called in correct order.

### `REL-10` Add cross-session rate-limit guard (shared state file)  ★★ · L · missing

- **Reference:** hermes-agent/agent/nous_rate_guard.py — records rate-limit state to ~/.hermes/rate_limits/nous.json so all CLI/gateway/cron sessions can check before retrying, preventing retry amplification (3 SDK retries × 3 Hermes retries × N concurrent sessions = N×9 calls hammering rate-limited provider)
- **Muse approach:** Create packages/resilience/src/rate-limit-guard.ts with recordRateLimitState(provider, resetSeconds, stateDir?) writing to ~/.muse/rate_limits/{provider}.json. Export isRateLimited(provider) that checks file mtime + reset time. Call from retry logic: if isRateLimited() returns true, fail fast without retry. Use atomic file replacement (write temp file, rename) to avoid corruption. State file expires 5+ minutes after reset time.
- **Value:** When Nous Portal (or any provider) is hammered by one session, other concurrent sessions immediately back off instead of piling on more requests. Protects provider from cascading failure and reduces wasted token spend.
- **Verify:** Write rate-limit state from session 1; verify session 2 reads it and skips retry. Simulate concurrent writes (race condition); verify file is not corrupted and both sessions see consistent state. Test that state expires after reset time.

### `REL-11` Add model-fallback pool with provider balancing  ★★ · M · partial

- **Reference:** hermes-agent/agent/run_agent.py — when primary model fails a non-retryable error or exhausts retries, consult fallback_models list in order until one succeeds or list exhausted
- **Muse approach:** Enhance packages/resilience/src/index.ts ModelFallbackStrategy to accept fallback sequence and track per-fallback success/failure metrics. On should_fallback=true from classifier, iterate fallbacks in order and attempt each. Record which fallback succeeded so the agent can emit 'fell back from openai/gpt-4 to anthropic/claude-3-5' to logs. Thread fallback result back to turn so agent can report it to user.
- **Value:** When primary model provider is down or rate-limited permanently, automatically try backup provider without user intervention. Increases reliability and throughput for multi-provider setups.
- **Verify:** Configure fallback sequence [primary, fallback1, fallback2]. Mock primary and fallback1 to fail with non-retryable errors; verify fallback2 succeeds and is used. Test fallback chain terminates cleanly when all fail.

### `REL-12` Implement timeout detection and recovery (client-side deadline)  ★★ · M · partial

- **Reference:** hermes-agent/agent/error_classifier.py — timeout error detection from type names (ReadTimeout, ConnectTimeout, APITimeoutError) and message patterns ('timed out', 'deadline exceeded'), classified as retryable with transport rebuild
- **Muse approach:** Enhance packages/resilience/src/index.ts withTimeout() to support per-attempt timeout tracking. When a timeout fires, classify as FailoverReason.timeout (retryable). In model-loop, on timeout classification, rebuild the model provider client (disconnect + reconnect) before retry. Track timeout count per provider to detect chronic timeouts that should escalate to fallback.
- **Value:** Transient network timeouts don't kill runs — client rebuilds connection and retries. Chronic timeouts on a provider escalate to fallback instead of retrying forever.
- **Verify:** Simulate a flaky provider that times out once then succeeds; verify withTimeout fires, classify returns timeout, client rebuilds, second attempt succeeds. Simulate provider that always times out; verify after 3 timeouts it escalates to fallback instead of infinite retries.

### `REL-13` Implement adaptive backoff based on error type  ★★ · M · missing

- **Reference:** hermes-agent/agent/retry_utils.py backoff + error_classifier.py reason — different error types imply different cooldown strategies (rate_limit: wait full reset time, timeout: quick retry, server_error: exponential backoff)
- **Muse approach:** Extend computeRetryDelay() in packages/resilience/src/index.ts to accept error reason as parameter. If reason=rate_limit and reset_seconds is known (from rate-limit headers), use that directly instead of exponential backoff. If reason=timeout, use shorter backoff (500ms base) with fast multiplier (1.5x) to recover quickly. If reason=server_error, use standard exponential. Thread error reason through retry loop.
- **Value:** Rate-limited waits the full reset time (no guessing); timeout-caused backoff is snappy; server errors retry at normal exponential pace. Reduces latency for recoverable errors.
- **Verify:** Retry with reason=rate_limit, reset_seconds=120; verify first delay is ~120s. Retry with reason=timeout; verify delays are 500ms, 750ms, 1.1s (1.5x). Retry with reason=server_error; verify delays are 100ms, 200ms, 400ms (2x).

### `REL-14` Implement turn-lifecycle metrics sink (structured diagnostics)  ★ · M · missing

- **Reference:** openclaw/extensions/diagnostics-otel/src/service.ts — emits structured diagnostic events (model.call.completed, model.call.error, session.recovery.requested) with OpenTelemetry attributes for tracing + metrics
- **Muse approach:** Create packages/observability/src/turn-lifecycle-metrics.ts exporting TurnLifecycleEvent union (turn_started, model_call_started, model_call_completed, model_call_error, recovery_attempted, turn_completed) and TurnLifecycleMetricsSink interface. Emit to existing AgentMetrics via recordEvent(). Capture: attempt count, error reason, recovery action, token usage deltas, wall-clock time per attempt. Integrate with OTel exporter in observability-tracers.ts.
- **Value:** Enables observability dashboards: 'what % of turns hit rate limits?', 'average recovery success rate per provider', 'cost per recovery attempt'. Turn-level metrics are the next level of detail above agent-level metrics.
- **Verify:** Emit 50 turn events (success/rate-limit/auth/format-error with various recovery paths); verify each event carries correct attempt count, error reason, token deltas. Test OTel export carries all events with proper trace linking.

### `REL-15` Add per-tool-call timeout and resource guards  ★ · M · missing

- **Reference:** hermes-agent/agent/turn_retry_state.py + run_agent.py — guards on tool execution time + output size to prevent a single tool call from consuming entire turn deadline or token budget
- **Muse approach:** Create packages/tools/src/tool-execution-guards.ts exporting ToolExecutionGuards with maxTimeoutMs, maxOutputChars. Check before executing: if wall-clock since turn start + expected tool time > turn deadline, skip tool. After execution: if output exceeds maxOutputChars, truncate (same as model-output trimming in model-loop). Emit truncation event to observability.
- **Value:** Prevents a runaway tool (e.g., search that returns 500K chars) from consuming entire token budget mid-turn. Keeps turn responsive even if one tool misbehaves.
- **Verify:** Set maxOutputChars=1000; execute tool that returns 50K chars; verify output is truncated and event is emitted. Set maxTimeoutMs and turn deadline; try to execute tool near deadline; verify tool is skipped with reason 'insufficient time'.

### `REL-16` Implement structured error audit log (non-blocking)  ★ · M · missing

- **Reference:** hermes-agent/agent/error_classifier.py output fed to run_agent.py error journal; openclaw diagnostics-otel logs error events with classified reason
- **Muse approach:** Create packages/observability/src/error-audit-log.ts exporting ErrorAuditEntry with timestamp, provider, model, error reason (from FailoverReason), status code, recovery path, whether it succeeded. Log to sqlite table (uses existing db/kysely integration) or stdout. Non-blocking append (queue + background writer). Query API: list errors by date/provider/reason/recovery, count distribution.
- **Value:** Operators can review: 'all 402 billing errors in June', 'which providers had the most timeout errors', 'did fallback succeed more often than retry?'. Post-incident analysis.
- **Verify:** Generate 100 errors with various reasons/statuses/recovery paths; verify all are logged with correct fields. Query by date range, provider, reason; verify returned rows match filter. Verify append is non-blocking (no latency spike).

### `REL-17` Add health check for provider availability (polled)  ★ · L · missing

- **Reference:** hermes-agent/agent — implicit via rate-limit tracking and cross-session guards; openclaw runtime does per-provider liveness probes
- **Muse approach:** Create packages/resilience/src/provider-health-check.ts with ProviderHealthChecker that periodically (every 30s configurable) sends a lightweight request to each provider (e.g., echo tool, simple prompt). Records: latency, error reason, success rate. Export isProviderHealthy(provider) returning bool. Hook into fallback decision: if fallback provider is unhealthy, try next one or fail faster.
- **Value:** Detects provider outages before users hit them. Enables health dashboard and automatic runbook triggers ('OpenAI is down for 10min, try Anthropic').
- **Verify:** Mock provider that's down; verify health check fails and isProviderHealthy returns false. Start provider; verify health check succeeds after next poll interval. Test with 3 providers; verify fallback skips unhealthy ones.

## 7. Background Autonomy · Cron · Proactive Review · Trajectory

_18 items_


### `AUT-1` Managed-cron contract + external scheduler integration (at-most-once, dedup, re-arm semantics)  ★★★★★ · L · partial

- **Reference:** hermes-agent/docs/chronos-managed-cron-contract.md: three-endpoint wire contract (provision/cancel/relay), NAS-mediated JWT trust model, agent→NAS→scheduler→agent callback, at-most-once + dedup via store CAS, reconcile self-healing, 60-120s TTL JWT verification
- **Muse approach:** Extend `packages/scheduler/src` to add `ManagedCronProvider` interface alongside existing `NodeCronScheduler`. New module `managed-cron-client.ts` implements Hermes' pattern: `reconcile()` computes next-run-at, `provision()` POSTs to manager `/api/cron/provision`, `cancel()` cancels one-shot. Inbound `/api/cron/fire` webhook (in apps/api) verifies JWT → claims job via store CAS (`claimJobForFire`) → fires → re-arms. Idempotent dedupe via `{jobId, fireAt}` key. Reconcile runs on start + after mutation. NO forking (small Muse model; direct execution).
- **Value:** Allows Muse to scale to zero while idle on hosted platforms (fire only on genuine due time via external manager). Enables multi-replica agent setups with shared cron state (Hermes' key production pattern).
- **Verify:** Integration test: (1) `provision()` to mock manager succeeds, (2) webhook `/api/cron/fire` with valid JWT fires job + re-arms next, (3) duplicate relay with stale `fireAt` is rejected (claim already advanced), (4) job mutation triggers reconcile (missing → provision, stale → re-arm), (5) manager unreachable → fallback to local in-process ticker.

### `AUT-2` Workflow serialization: save multi-turn plan + branching as replayable workflow (for team/community sharing)  ★★★★★ · L · missing

- **Reference:** openclaw/docs/automation/taskflow.md: Task Flow manages multi-step durable flows; workflows are stored + can be replayed; Lobster workflow files (YAML) define steps + approval gates
- **Muse approach:** Add `packages/proactivity/src/workflow-capture.ts`: after multi-turn session (>5 turns, or explicit `/save-workflow`), serialize conversation to `~/.muse/workflows/<name>.yaml`: (1) metadata (name, intent, tags), (2) step sequence (user message → model response → tools used), (3) decision points (if user corrected, mark as branch), (4) success signal (final outcome). Export: `muse workflow save session:<id> --name daily-report --tags standup,async`. Reuse: `muse workflow run daily-report [--with <vars>]` replays (prompts for branches). Publish: export YAML for sharing.
- **Value:** Teams can share working agent workflows ('here's how we do market intel'). Enables template skills (workflow-level, not single-skill). Reproducible complex tasks across users.
- **Verify:** Test: (1) capture serializes multi-turn session as YAML, (2) replay runs workflow (user prompted at branch points), (3) variable substitution works ({{date}}, {{topic}}), (4) exported workflow is valid YAML, (5) shared workflow runs identically on another machine.

### `AUT-3` Session lifecycle + expiry management (idle reset, daily reset, suspension recovery)  ★★★★ · M · missing

- **Reference:** hermes-agent/docs/session-lifecycle.md: session expiry policy with idle/daily reset modes, entry state-machine, `_is_session_expired()`, `was_auto_reset`/`resume_pending` flags, background expiry watcher
- **Muse approach:** Implement `packages/proactivity/src/session-lifecycle.ts` with `SessionEntry` record (metadata + reset flags), `SessionStore` (in-memory + file-backed via atomic-file-store), policy evaluator (`isSessionExpired`, `shouldReset`), and background watcher task (`startSessionExpiryWatcher`) that finalizes old sessions and marks stale entries. Integrate into server's tick-daemon via `session-expiry-tick.ts`; CLI side benefits from shared session store interface. Reuse existing `atomic-file-store` + `personal-action-log-store` patterns for persistence.
- **Value:** Enables session context preservation across turns and multi-turn learning signals (background review can see session drift). Prevents unbounded memory growth of abandoned conversations.
- **Verify:** Write test asserting: (1) idle-expired session is marked `was_auto_reset=true`, (2) resume-pending session preserves session_id on next access, (3) daily reset fires at configured hour, (4) suspended session forces hard reset, (5) background watcher evicts stale cached agents after idle TTL.

### `AUT-4` Cron job run-history + failure tracking (persisted execution log, run duration, error classification, backoff counters)  ★★★★ · S · partial

- **Reference:** openclaw/docs/automation/cron-jobs.md: `openclaw cron runs --id <job-id>` shows history; run records capture status (ok/error/timeout), duration, result; failure alerts with backoff + consecutive-skip counters
- **Muse approach:** Extend `packages/scheduler/src/scheduler-stores.ts` with `CronRunHistoryStore` (already has execution recorder): add `queryRunHistory(jobId, limit?, since?)` that returns sorted run records. CLI command `muse schedule runs <jobId> [--limit N] [--since <date>]` queries + formats (duration, status, error preview). Failure alerts: track consecutive-error count in job metadata, suppress after N consecutive failures unless `failureAlert.includeSkipped=true`. Reuse existing run-record persistence (execution-recorder already saves to DB).
- **Value:** Operator visibility into why jobs fail + recurring failure patterns. Backoff gates noisy re-notifications (rate-limit, auth failures). Shows whether a schedule is reliable or needs tuning.
- **Verify:** Test: (1) query job runs returns records sorted by date, (2) failed run shows error classification (timeout/auth/rate-limit), (3) N consecutive failures suppress alerts, (4) skip counter persists across runs, (5) manual retry resets backoff counter.

### `AUT-5` Model switch + version mismatch detection in cron / background jobs (fallback chain, fast mode, auth profile override)  ★★★★ · M · missing

- **Reference:** openclaw/docs/automation/cron-jobs.md: per-job model override + fallback chain; fast mode per model config; auth profile override on live model-switch; isolated jobs track provider/model/auth for each run
- **Muse approach:** Extend `ScheduledJob` interface in `packages/scheduler/src/index.ts` to add optional `modelOverride?: string`, `fallbackModels?: string[]`, `fastMode?: 'auto'|'on'|'off'`, `authProfileId?: string`. `ScheduledJobDispatcher` resolves model via precedence: per-job override → agent default. On cloud-provider timeout, retry with fallback model (like OpenClaw pattern). Store resolved model + auth in execution record so run history shows which model actually ran. CLI: `muse schedule edit <id> --model claude-opus --fallbacks claude-sonnet,claude-haiku`.
- **Value:** Allows users to force expensive tasks to cheaper models, or slow tasks to faster inference. Survives model provider downtime via fallbacks. Audit trail of actual model used (cost tracking, model-specific failure analysis).
- **Verify:** Test: (1) per-job model override is used, (2) fallback retries on timeout, (3) fast mode is passed to provider, (4) auth profile override is applied to fallback model, (5) execution record captures final model + auth used.

### `AUT-6` Consolidation curator loop: idle-triggered skill merge (pinned skills never touched, archive old versions, test consolidated skills)  ★★★★ · L · partial

- **Reference:** hermes-agent/agent/curator.py: when idle (no activity ≥ interval_hours), fork agent to pin/archive/consolidate overlapping skills. Never deletes (archive is recoverable). Consolidate via agent-guided merge, test merged skill, then mark old as archived
- **Muse approach:** Extend `packages/proactivity/src` with `curator-consolidation-loop.ts` (part of idle-daemon tick): when idle ≥ `MUSE_SKILL_CONSOLIDATE_IDLE_HOURS` (default 24h, gated by `MUSE_SKILL_CONSOLIDATE_ENABLED`), fork a local-model session to (1) list all user skills, (2) find overlapping pairs (cosine sim on SKILL.md content ≥ 0.7), (3) for each pair, run merge prompt ('these cover the same topic; consolidate into one'), (4) test merged skill on a scenario from both old skills, (5) if test passes, mark old skills archived (not deleted), new skill active. Integrate into `startIdleCuratorTick()` in apps/api.
- **Value:** Prevents skill library sprawl (10+ overlapping Docker skills → 1 consolidated). Merges learning from multiple sessions (pattern-matching across contexts). Archive-not-delete keeps recovery path (skill can be un-archived if consolidation was wrong).
- **Verify:** Test: (1) idle cursor runs when activity silent ≥ interval, (2) overlap detection finds similar skills, (3) merged skill is authored + stored, (4) old skills marked archived (not deleted), (5) merged skill is tested on both old scenarios, (6) pinned skills are never consolidated.

### `AUT-7` Insights engine + usage analytics (token cost, tool usage patterns, skill load/edit frequency, activity by hour/day)  ★★★ · M · missing

- **Reference:** hermes-agent/agent/insights.py: InsightsEngine.generate(days=30) queries sessions + tool_calls + skill_usage from SQLite; computes overview (tokens, cost, duration), model/platform/tool breakdowns, skill/activity patterns; `format_terminal()` + `format_gateway()`
- **Muse approach:** Add `packages/agent-core/src/insights-engine.ts` (or `apps/api/src/insights`): query SessionDB (Muse already has Postgres session records from hermes-state if on server, or episodic-store from memory). Compute overview (total input/output/cache tokens, estimated cost via existing pricing module), model breakdown (sessions per model, tokens), tool usage (count from session records), skill usage (from memory store skill-view tool calls). Format as JSON + text (CLI/API response). Integrate as CLI command `muse insights [--days N] [--format json]` + API `GET /api/insights`.
- **Value:** User-facing observability: cost tracking, model selection patterns, tool reliability, skill ROI. Feeds improvement loop (which skills to consolidate, which tool choices are expensive).
- **Verify:** Test: (1) query sessions + tool calls over N days, (2) compute aggregates (total tokens, avg/session), (3) format_terminal renders bar charts + top-N rankings, (4) breakdown by model shows token + cost split, (5) skill usage extracts from agent's tool-call log.

### `AUT-8` Cron delivery targets with platform-specific routing + announcement fallback  ★★★ · S · partial

- **Reference:** openclaw/docs/automation/cron-jobs.md: announce + webhook modes; channel allowlist validation; reroute stale targets; DM pairing-store approvals excluded; platform prefix validation (telegram:id vs slack:id); failure-destination separate from primary
- **Muse approach:** Extend `SchedulerMessaging` in `packages/scheduler/src/scheduler-runtime.ts` with delivery-options resolver: `announce` mode falls back to configured channel if agent didn't send; `webhook` mode POSTs structured event; `none` suppresses both. Add `failureDestination` override (separate from primary). Validate platform prefixes (if `delivery.to='telegram:123'`, require `channel='telegram'`). CLI: `muse schedule edit <id> --announce --channel slack --to channel:C1234 --failure-dest @me`.
- **Value:** Users can route job outputs to different channels + fallback on agent silence. Separate failure notifications (DND-aware, different audience). Platform validation prevents silent misroutes.
- **Verify:** Test: (1) announce mode uses channel if agent didn't send, (2) webhook POSTs structured event, (3) platform prefix mismatch is rejected, (4) failure destination overrides primary, (5) stale target is re-validated via allowlist.

### `AUT-9` Persistent cron session (build-on-history pattern for recurring workflows)  ★★★ · M · missing

- **Reference:** openclaw/docs/automation/cron-jobs.md sessionTarget='custom': `session:xxx` persists context across runs; enables workflows like daily standups that build on previous summaries; `session:market-intel` runs against the same conversation history each day
- **Muse approach:** Extend `ScheduledJob` to support `sessionType: 'isolated' | 'main' | 'custom'` + optional `customSessionId?: string`. In `ScheduledJobDispatcher`, when session-type is 'custom', reuse the same session_id across runs (route via SessionStore). First run creates the session; subsequent runs append to existing transcript. Transcript loading: if session exists, load full history; if new, start blank. CLI: `muse schedule add --message 'Summarize today.' --session session:daily-standup --cron '0 9 * * *'`.
- **Value:** Enables persistent workflows (daily standup builds on yesterday's summary, weekly report accumulates context). Common in production agent usage (market updates with prior context, incident logs that grow).
- **Verify:** Test: (1) first run creates session, (2) second run loads prior transcript, (3) run 2 message appends to run 1, (4) model sees full history, (5) session reset doesn't lose prior runs (archived, not deleted).

### `AUT-10` Time-series resource tracking: CPU/memory/token-per-second, model provider latency, tool execution time percentiles  ★★★ · M · missing

- **Reference:** hermes-agent/agent/insights.py: compute_overview aggregates duration, tokens, cost across sessions; hermes-agent tracks tool_call_count + session duration in DB for later analytics
- **Muse approach:** Add `packages/observability/src/perf-tracker.ts`: on `afterTool`, record `{ toolName, status, durationMs, inputTokens, outputTokens }`. On `afterComplete`, record `{ totalDuration, modelSwitches, toolCount }`. Append to `~/.muse/perf-samples.jsonl` (FIFO trim 10k). CLI: `muse perf [--window 7d] [--tool <name>]` shows: avg tool duration by tool, p50/p95 latency, model provider latency (if tracked via switch events), token throughput (tokens/sec). Integrate into insights engine.
- **Value:** Performance observability: which tools are slow, which models have high latency, regression detection (same tool slower this week). Feeds cost optimization (prefer fast cheap models).
- **Verify:** Test: (1) afterTool records duration + status, (2) afterComplete records summary, (3) query perf-samples by tool name, (4) compute p50/p95 latency, (5) identify slowest tools, (6) perf regression detected when avg duration increases >20%.

### `AUT-11` Escalation + stuck-loop detection: reset session after 3 consecutive failed turns, mark for manual review  ★★★ · M · partial

- **Reference:** hermes-agent/docs/session-lifecycle.md _suspend_stuck_loop_sessions: if session active across 3+ consecutive restarts, auto-suspend (hard wipe). Monitors retry count + restart count to detect stuck loops
- **Muse approach:** Enhance `packages/proactivity/src/session-lifecycle.ts` with `detectStuckLoops()` logic (run in background watcher): if a session's last 3 turns all have `status='error'` OR last 3 tool calls all `status='failed'`, mark `escalated=true` + append to `~/.muse/escalated-sessions.jsonl`. CLI: `muse escalations list` shows stuck sessions + reason (error chain or failure chain). Manual surface: `muse escalations triage <sessionId>` to review cause + decide: reset (clear context) vs abort (mark done). Integrate into session expiry watcher (escalated sessions get extra scrutiny, not auto-reset).
- **Value:** Prevents infinite-retry loops (session gets stuck, keeps failing, hides user. Now surfaced + escalated to human). Operator visibility into systemic failures (provider down, tool broken, task impossible).
- **Verify:** Test: (1) 3 consecutive failed turns → escalated=true, (2) escalated session is NOT auto-reset, (3) escalations list shows session + reason, (4) triage command resets/aborts and records decision, (5) session no longer escalated after reset.

### `AUT-12` Session transcript compression (summarize old turns, preserve recent context for prompt caching)  ★★★ · M · partial

- **Reference:** hermes-agent/trajectory_compressor.py + session-lifecycle.md: compress old turns via summary when session gets long; preserve recent turns for prefix-cache; old summaries linked to original turns (trace back)
- **Muse approach:** Enhance `packages/memory/src/episodic-store.ts` with compression: when session exceeds N turns (default 100), summarize oldest M turns (default 50) to 1-2 bullets. Replace turns in transcript with summary + pointer. Store original turns to backup file (archived, not deleted). Keep recent K turns (default 20) uncompressed for prefix cache. Hook: run compression in `afterComplete` if turn-count threshold hit, fire-and-forget (fail-soft). CLI: `muse compress [--session <id>] [--keep-turns N]`.
- **Value:** Long sessions stay in context window (context-efficient). Prefix cache warming kept alive (recent turns uncompressed). Archival trail preserved (audit, recovery).
- **Verify:** Test: (1) session >100 turns → oldest 50 compressed to summary, (2) summary captures key facts (names, decisions), (3) recent 20 turns uncompressed, (4) model can reference compressed turns, (5) original turns backed up (recoverable), (6) compression survives restart.

### `AUT-13` Trajectory recording + session artifact logging (conversation shape, outcome, efficiency metrics)  ★★ · S · missing

- **Reference:** hermes-agent/agent/trajectory.py: save_trajectory() appends JSONL per session with ShareGPT format, timestamp, model, completion status; hermes-agent stores failed trajectories separately for failure analysis
- **Muse approach:** Add `packages/agent-core/src/trajectory-recorder.ts`: on `afterComplete`, serialize `{ turns: messages[], model, completedAt, success, metadata: { toolCalls, switches, duration } }` to `~/.muse/trajectories.jsonl` (append-only, FIFO trim at 10k). Separate `failed-trajectories.jsonl` for session where `success=false` or final tool call failed. Integrate via `HookStage` (afterComplete), fire-and-forget. Reuse existing JSON append + trim patterns (proactive-notice-store).
- **Value:** Enables post-hoc analysis: which task shapes fail (tool-heavy, long chains), model selection patterns, efficiency vs cost. Feeds eval:orchestration evals (trajectory match, step efficiency). Ground for skill authoring (what session patterns warrant reusable skills).
- **Verify:** Test: (1) successful session → `trajectories.jsonl`, (2) failed session → `failed-trajectories.jsonl`, (3) both files append-only + trim to 10k, (4) metadata includes tool call count + duration, (5) failed status is `true` when final turn has tool error.

### `AUT-14` Commit-outcome preference learning: score model/tool choices by whether they led to successful outcomes  ★★ · M · missing

- **Reference:** hermes-agent/agent/insights.py _compute_model_breakdown + background_review.py skill trigger: tool-iteration cadence is outcome-sensitive (hard tasks = many tool iterations = skill trigger sooner); Hermes never captures model choice success rate explicitly but uses task-difficulty (iterations) as salience
- **Muse approach:** Add `packages/agent-core/src/outcome-scoring.ts`: on `afterComplete`, score the session outcome (`success=true` if final tool was successful + user didn't correct), model used, tool choices made. Store scored outcomes to `~/.muse/outcomes.jsonl` (model, tool_sequence, success, duration). Query by model to compute success rate + average steps. Integrate into insights engine (show model success %). Use in auto-model-selection heuristic (prefer models with >80% success rate on similar tasks).
- **Value:** Data-driven model selection: cheap models that succeed on your tasks vs expensive models that fail. Feeds earned-proactivity style credibility scoring (which tools you trust on which task types).
- **Verify:** Test: (1) successful session scores outcome=true, (2) session with correction scores outcome=false, (3) outcomes queryable by model, (4) success rate computed as fraction of true outcomes, (5) insights engine reports per-model success %.

### `AUT-15` Proactive scheduler: bring-forward notifications for overdue items (task approaching true deadline, calendar event imminent, overdue check-in)  ★★ · S · partial

- **Reference:** hermes-agent/docs/session-lifecycle.md session context + proactive-notice-loop.ts: calendar lead window (imminent) + tasks due soon (lead) + check-ins due (lead). Hermes synthesizes ONE-LINE LLM heads-up inline to live chat when user active; Muse has most of this but no persistent deferred-notification queue
- **Muse approach:** Enhance `packages/proactivity/src/proactive-notice-loop.ts` with `DeferredNotificationQueue` (store imminent items that fired but user was DND). On quiet-hours end or first user activity after, surface queued items in order. Also add `bring-forward` command (`muse proactive bring-forward`) that scans deferred queue + surfaces N most-recent items. Integrate into daemon's wake logic: on quiet-hours end, check deferred queue before computing next-due items.
- **Value:** Users don't miss deadlines due to DND window (notified on quiet-hours end). Proactivity queue survives daemon restart (durably stored).
- **Verify:** Test: (1) imminent item during DND is queued (not surfaced), (2) on DND end, queued items are surfaced in FIFO order, (3) bring-forward command shows queued items + count, (4) queue survives restart (persisted), (5) old queued items are discarded (expiry: if due date passed).

### `AUT-16` Multi-turn expectation-setting: declare upfront what the session is about so proactivity + skills know context  ★★ · S · missing

- **Reference:** hermes-agent/docs/session-lifecycle.md SessionContext: session metadata injected into system prompt (where did message come from, shared vs private, what platforms are connected); OpenClaw session types (main/isolated/custom) affect context availability; agents know if they're in a focused cron job vs ambient chat
- **Muse approach:** Add `packages/agent-core/src/session-context-builder.ts`: at session start, optionally declare `{ sessionType: 'learning'|'task'|'ambient', focus?: string, expectedDuration?: string }`. Store in SessionEntry. Inject into system prompt (e.g. 'You are in a 15-minute learning session on Docker; stay focused'). Use to gate proactivity (suppress ambient notices in 'learning' mode) and skill authoring (focus='Docker' → skills tagged Docker). CLI: `muse session focus --task 'Debugging prod issue' --expected-duration 30m`.
- **Value:** Proactivity respects focus mode (no unrelated notices during deep work). Skills are scoped (Docker-specific learning in Docker session, not generic). Users control agent behavior without system-prompt editing.
- **Verify:** Test: (1) session declared with focus='learning' suppresses ambient proactive notices, (2) focus is injected into system prompt, (3) skills authored in 'learning' session are tagged with focus keyword, (4) session-end summary mentions focus (learned re: Docker), (5) DND during focus overrides normal quiet-hours.

### `AUT-17` Scheduling suggestions + patterns: detect recurring tasks and propose cron jobs or standing objectives  ★★ · M · missing

- **Reference:** hermes-agent/cron/suggestions.py + suggestion_catalog.py: detect patterns in user's chat (weekly standup, daily briefing, monthly report) and suggest cron jobs. Hermes suggests based on explicit keywords + time patterns
- **Muse approach:** Add `packages/proactivity/src/schedule-suggestions.ts`: after background review, scan recent turns for patterns: (1) repeated requests at same time ('every Monday', 'daily'), (2) standing phrases ('send me the weekly', 'recap from today'), (3) check-in language ('how did', 'did we'). Suggest as `{ kind: 'cron'|'objective', text: string, cron?: string, reason: string }` stored to `~/.muse/suggested-schedules.json`. CLI: `muse schedule suggest` shows pending suggestions + accept/dismiss. On accept: create cron job or objective. Use confidence gate (only suggest if ≥2 instances + >5 days apart).
- **Value:** Reduces user friction: 'I said this three times' → 'Want me to schedule it?' User discovers automation opportunities without explicit `/schedule` command.
- **Verify:** Test: (1) detect repeated request pattern (same text 2+ times >5 days apart), (2) suggest cron job with extracted expression, (3) suggest objective if 'watch X until Y' pattern, (4) confidence gate suppresses <2 instances, (5) accept creates scheduled job, (6) dismiss marks in avoid-list (no re-suggest).

### `AUT-18` Background review salience gating: only schedule skill review when window had tool failures  ★ · S · partial

- **Reference:** hermes-agent/agent/background_review.py `isSkillReviewSalient()`: tool failures flag (status='failed') gates skill-review trigger; successful-only windows are low-salience; write-time gating per arXiv:2603.15994
- **Muse approach:** Update `packages/agent-core/src/background-review.ts` `ReviewSalience` interface + `evaluateReviewTriggers()` to apply write-time salience gating: when `reviewSkill=true` AND `salience.toolFailures === 0`, downgrade to `reviewSkill=false`. Already half-implemented (counters track toolFailures); just gate the final trigger decision. No new LLM, no new data source — purely a filter on existing counters.
- **Value:** Prevents skill-review LLM calls on smooth sessions (only successful tool calls). Reduces review cost + noise while preserving learning from hard tasks (failures are the signal that skill is worth authoring).
- **Verify:** Test: (1) all-successful tool calls → salience.toolFailures=0 → reviewSkill=false (trigger gated), (2) one-failed call → salience.toolFailures≥1 → reviewSkill=true, (3) counter values match window length.

## 8. Multi-Agent Orchestration · ACP · Sub-Agents · Gateways

_18 items_


### `ORC-1` Implement supervisor agent gateway for distributed endpoint management  ★★★★★ · L · missing

- **Reference:** openclaw/extensions/codex-supervisor/src/supervisor.ts — CodexSupervisor class manages connections to multiple Codex app-server endpoints, lists sessions, reads transcripts, steers/interrupts turns
- **Muse approach:** Create packages/gateway/src/supervisor-agent.ts implementing a LocalSupervisor class that: (1) maintains a registry of local agent endpoints (spawned via scheduler/proactivity), (2) probes endpoint readiness with lightweight ping, (3) routes new requests to the least-busy endpoint by querying session count, (4) provides listSessions/readSession/sendToSession/interruptSession methods matching the endpoint interface. Respects local-only by spawning only local Ollama-backed agents; no cloud vendor routing.
- **Value:** Moves Muse from single-agent per session toward multi-agent load balancing and supervision, enabling high-concurrency workloads and graceful endpoint degradation (if one agent crashes, others still serve).
- **Verify:** Test that supervisor correctly routes 5 simultaneous messages to 2 local agents, failover when one endpoint fails, and maintains session affinity across turns.

### `ORC-2` Add turn-level session context and source metadata tracking  ★★★★ · M · partial

- **Reference:** hermes-agent/gateway/session.py SessionSource dataclass (platform, chat_id, user_id, thread_id, chat_type, etc.) + gateway/run.py session caching by LRU/TTL
- **Muse approach:** Extend packages/multi-agent/src/orchestrator.ts and packages/agent-core/src to add TurnContext interface: { sessionKey, turnId, source: SessionSource, profile?, timestamp }. Muse already has sessionKey; add SessionSource (platform, userId, channelId, threadId) as optional metadata injected by messaging adapters. Store in orchestration-history.ts for audit trail. Hermes uses this for system prompt injection (telling the agent where it's running); Muse uses it for response routing back to the originating channel.
- **Value:** Enables message routing to reply in the original channel/thread, and supports multiplexed profiles (serve multiple orgs/workspaces from one Muse instance without cross-contamination).
- **Verify:** Test that a message from Slack thread A is routed back to thread A (not thread B), and that two sessions from different profiles don't mix message history.

### `ORC-3` Implement typed event streaming dispatcher with adapter rendering hooks  ★★★★ · M · missing

- **Reference:** hermes-agent/gateway/stream_dispatch.py GatewayEventDispatcher — routes typed stream events (MessageChunk, ToolCallChunk, etc.) through adapters' render_message_event/format_tool_event hooks
- **Muse approach:** Create packages/messaging/src/stream-dispatcher.ts implementing StreamEventDispatcher class: (1) consumes typed events from agent execution (MessageChunk, ToolStart, ToolEnd, Commentary), (2) routes through an adapter's render methods (no-op for unknown platforms), (3) enqueues rendered lines to a delivery sink (e.g., Telegram/Slack streaming API). Makes tool-progress rendering pluggable so adapters decide native chrome vs plaintext; solves the 'tool updates race the final message' problem Hermes solved.
- **Value:** Unifies event delivery across all channel adapters; solves streaming ordering bugs and lets platforms (Discord, Slack) render tool progress natively instead of as fallback text.
- **Verify:** Test that tool-progress events are rendered in order on Slack; that a platform adapter can suppress tool chrome and the response still completes cleanly.

### `ORC-4` Add turn interruption and steering for active agent runs  ★★★★ · M · missing

- **Reference:** openclaw/extensions/codex-supervisor/src/supervisor.ts interruptSession/sendToSession with turnId resolution — finds in-progress turn and sends turn/steer or turn/interrupt RPC
- **Muse approach:** Extend packages/multi-agent/src to add TurnInterrupt interface with turnId + reason (user_request | deadline | resource_limit). Track active turns in orchestrator via new ActiveTurnRegistry (sessionKey → { turnId, workerId, startTime, cancelToken }). On interrupt: (1) set cancelToken, (2) wait for agent's event loop to check it, (3) capture partial output. On steer: (1) inject a new message into the agent's message history, (2) resume execution. Both are local-only without cloud API dependencies.
- **Value:** Lets users stop long-running agents (e.g., infinite loop in a tool) and redirect them mid-turn (e.g., 'actually, check the staging DB instead'). Critical for interactive UX in messaging apps.
- **Verify:** Test that /stop cancels a 30-second sleep within 100ms; that /steer injects a message and the next tool call reflects the new instruction.

### `ORC-5` Implement endpoint health probing and circuit-breaker pattern  ★★★ · S · missing

- **Reference:** openclaw/extensions/codex-supervisor/src/supervisor.ts probeEndpoints() — calls thread/loaded/list on each endpoint, catches errors, returns {endpointId, ok, detail}
- **Muse approach:** Add packages/resilience/src/endpoint-health.ts with EndpointProber: (1) periodic probe of agent socket readiness (every 10s), (2) track failure count and latency, (3) circuit-breaker state (healthy, degraded, down), (4) supervisor routes away from unhealthy agents. Lightweight — just a TCP connect + close, no work. Local-only: probes are to localhost:port.
- **Value:** Prevents cascading failures when one local agent becomes unresponsive; supervisor retries the request against a healthy peer instead of timing out.
- **Verify:** Test that supervisor marks an agent down after 3 probes fail; then re-enables it when probes succeed again.

### `ORC-6` Add session resumption and crash recovery for distributed agents  ★★★ · L · missing

- **Reference:** hermes-agent/acp_adapter/session.py SessionManager + gateway/session.py load_session/resume_session — persists session state to SessionDB; on restart, recover from last checkpoint
- **Muse approach:** Extend packages/multi-agent/src/subagent-run-registry.ts and packages/db/ to persist SubAgentRun snapshots to Postgres (sessionKey, turnId, workerId, checkpoint, lastMessage, status). On resume: (1) query DB for the last complete turn, (2) reload agent into memory, (3) resume from next turn. Graceful degradation — if DB is unavailable, fall back to in-memory (current Muse behavior). Encryption-at-rest via packages/memory.
- **Value:** If a local Ollama agent crashes or the host reboots, the next request for that session resumes cleanly from the last checkpoint instead of losing history.
- **Verify:** Test that persisting a mid-turn checkpoint and killing the agent allows a new instance to resume on next message without losing history.

### `ORC-7` Implement draft-first approval gate for multi-agent outbound actions  ★★★ · M · partial

- **Reference:** hermes-agent/acp_adapter/permissions.py make_approval_callback; openclaw/extensions/acpx/src manages approval policy per-model
- **Muse approach:** Extend packages/multi-agent/src/orchestrator.ts to intercept outbound actions from workers (tool calls, file writes, network requests) and collect them into a 'draft' (Muse calls these 'sketches' in agent-core). Before executing, check packages/policy/'s approval rules: (1) if high-risk (delete file, send email), ask for human approval, (2) if low-risk, auto-approve. Muse already has policy/approval-gate; the gap is that multi-agent orchestration doesn't currently funnel worker actions through this gate — they run immediately. Route all worker outputs through agent-core's grounding + reflection layer (already present) before the fan-in.
- **Value:** Prevents a rogue worker from deleting critical files even if it was selected by the supervisor; all edits go through the existing Muse approval flow.
- **Verify:** Test that a worker's file-delete action is held for approval before execution; that a concurrent worker's read still completes while the delete waits.

### `ORC-8` Implement worker output synthesis with conflict and redundancy detection  ★★★ · M · partial

- **Reference:** openclaw/extensions/orchestration/src/orchestration-fan-in.ts detectConflicts/detectRedundancies with synthesis guidance (arXiv:2605.02801 +15.6% quality gain)
- **Muse approach:** Muse already has orchestration-fan-in.ts with synthesis and verification. The gap is detectConflicts and detectRedundancies are callable but not IMPLEMENTED — they're optional parameters passed in. Create packages/agent-core/src/fan-in-verifiers.ts with: (1) detectConflicts(parts[]) → runs a grounded fact-checker over worker outputs to find contradictions, (2) detectRedundancies(parts[]) → labels redundant information so the synthesizer avoids repeating it. Both are bounded (one model call each). Wire them into orchestrator.ts by default if no custom verifiers are provided.
- **Value:** Automatically flags contradictory worker outputs (e.g., 'bug fixed in v1.2' vs 'bug still open in v1.2') before presenting them; surfaces redundant info so synthesizer combines intelligently.
- **Verify:** Test that two workers contradicting each other on a fact are flagged; that redundant detail (the same point from two workers) is detected.

### `ORC-9` Implement graceful degradation when a worker fails  ★★★ · M · partial

- **Reference:** openclaw/packages/multi-agent/src/orchestrator.ts selectWorker() fallback logic; hermes-agent/gateway/run.py agent cache eviction and fallback handling
- **Muse approach:** Muse's orchestrator already retries on worker failure (maxHandoffs). The gap is GRACEFUL DEGRADATION — when a worker is consistently failing, exclude it and don't retry. Extend orchestrator.ts with FailureTracker: (1) track consecutive failures per worker (up to 3), (2) if 3 consecutive, mark as 'degraded' and exclude from future handoff selection, (3) periodic health-check (once per minute) to re-enable. Combine with endpoint-health probing — if endpoint is down, don't even try to reach its workers.
- **Value:** A broken worker doesn't poison every request; the supervisor learns to avoid it and still serves other requests against healthy workers.
- **Verify:** Test that after 3 worker failures, it's excluded; that a 5th request routes to a fallback worker; that periodic re-enable kicks in.

### `ORC-10` Implement model routing and session-level model selection per turn  ★★ · S · partial

- **Reference:** openclaw/extensions/codex/src/conversation-control.ts setCodexConversationModel — turn-level model override via turn/start {model: 'custom-model'}; hermes-agent/acp_adapter/session.py handles toolset expansion per model
- **Muse approach:** Extend packages/agent-core/src/orchestrate.ts to accept Optional<turnModel> in OrchestrateOptions. If set, override agent-core's default model for this turn. In packages/multi-agent/src/orchestrator.ts, allow per-worker model selection in WorkerRunOptions. Hermes links model to toolset (model A has tools X,Y; model B has X,Y,Z); Muse already does this in autoconfigure. The gap is allowing a USER (via /model command) to override the model mid-session.
- **Value:** Lets users switch between gemma4:12b (faster, general) and a specialized model (code, math) without restarting the session or agent.
- **Verify:** Test that a user command /model gemma2:27b persists the preference and the next turn uses that model.

### `ORC-11` Add process lifecycle management and lease tracking for spawned agents  ★★ · S · missing

- **Reference:** openclaw/extensions/acpx/src/process-lease.ts createAcpxProcessLeaseId, withAcpxLeaseEnvironment — environment-variable-based lease tracking; process-reaper.ts cleanupOpenClawOwnedAcpxProcessTree
- **Muse approach:** Create packages/proactivity/src/agent-process-lease.ts: (1) assign each spawned agent a leaseId (UUID), (2) pass it via MUSE_AGENT_LEASE env var, (3) on supervisor shutdown, kill only agents with MUSE_AGENT_LEASE set (child processes spawned by Muse), not unrelated processes. Use node:child_process with detached: false (the default) so child agents inherit the parent's process group and get SIGTERM on parent exit. Respects local-only: all processes are local.
- **Value:** Prevents zombie agent processes accumulating on restart; enables clean shutdown sequences where the supervisor waits for agents to finish their current turn before exiting.
- **Verify:** Test that killing the supervisor process does not leave orphaned node processes; that agents receive SIGTERM within 1 second of supervisor shutdown.

### `ORC-12` Add multi-model expert routing with per-worker model assignment  ★★ · S · partial

- **Reference:** openclaw arXiv:2605.02801 MAST with per-worker model assignment; Muse/packages/agent-core has council orchestration but not per-proposer model override
- **Muse approach:** Extend packages/multi-agent/src/workers.ts AgentWorker interface to include Optional<preferredModel>. In orchestrator.ts run(), pass worker.preferredModel to the worker's agent-core invocation. Allows a 'code-expert' worker to use a code-tuned model while 'general' uses the default. Hermes links models to tool schemas; Muse already does this in autoconfigure. The gap is explicit per-worker model hints in the orchestration layer.
- **Value:** Specialized workers get their preferred model (code expert on deepseek-coder, knowledge expert on mistral), boosting quality without increasing latency (parallel execution).
- **Verify:** Test that a code-worker gets its declared model even if the default is different; verify parallel execution doesn't serialize model loading.

### `ORC-13` Add session list and metadata query API with pagination  ★★ · M · partial

- **Reference:** openclaw/extensions/codex-supervisor/src/supervisor.ts listSessions/listSessionSnapshot with includeStored/maxStoredSessions and cursor-based pagination
- **Muse approach:** Extend packages/multi-agent/src or messaging/src with SessionQueryAPI: (1) list all active sessions (supervisor + its agents), (2) return metadata (session key, last turn time, participant count, model), (3) cursor-based pagination (e.g., ?cursor=0&limit=20). Muse has messaging/inbox-store.ts for sessions; query it with indexed lookups. Hermes uses session_search agent tool for this — Muse has eval:agent tools but not a dedicated 'list_sessions' tool exposed via A2A/ACP.
- **Value:** Dashboards can enumerate all active Muse sessions and their state without polling every agent; supervisors can make load-balancing decisions based on session metadata.
- **Verify:** Test that /list-sessions returns 100 sessions in <100ms with cursor pagination; verify timestamps are correct.

### `ORC-14` Add adaptive worker timeout based on task complexity  ★★ · S · partial

- **Reference:** openclaw arXiv:2605.02801 adaptive timeouts per task complexity; hermes-agent/gateway/run.py _AGENT_CACHE_IDLE_TTL_SECS and request timeout management
- **Muse approach:** Extend packages/multi-agent/src/orchestrator.ts with AdaptiveTimeoutPolicy: (1) classify task complexity from input (word count, tool count, recursion), (2) set worker timeout accordingly (simple: 5s, medium: 30s, complex: 120s), (3) cap at global orchestrationTimeoutMs. Muse already has workerTimeoutMs in orchestrator options; add a callback workerTimeoutPolicy?(input) → ms. Use heuristics: input.messages.length × wordCount as a proxy for complexity.
- **Value:** Prevents a simple greeting from waiting 2 minutes for a worker; complex research tasks get the time they need without artificially timing out at 10s.
- **Verify:** Test that a simple 'hi' task times out workers after 5s; a 'research this topic' task allows 120s.

### `ORC-15` Implement leader-worker orchestration with elected lead agent  ★★ · L · missing

- **Reference:** openclaw/packages/acp-core/src/session.ts and multi-agent/src/lead-worker.ts LeadWorkerOrchestrator — one agent leads, others are workers; lead synthesizes and routes to workers
- **Muse approach:** Extend packages/multi-agent/src/lead-worker.ts (currently just a stub): (1) designate one agent as lead (e.g., the one that scores highest on canHandle for the input), (2) give lead the ability to invoke other workers as tools ('call_worker' tool), (3) let the lead decide when to delegate, (4) lead synthesizes the final answer. Differs from supervisor orchestration (lead is ONE of the agents, not external). Useful for hierarchical task decomposition (lead breaks down the problem, delegates to specialists, composes answer).
- **Value:** Enables more sophisticated delegation patterns where the lead agent itself decides whether to involve other specialists, vs the supervisor making that decision upfront.
- **Verify:** Test that a lead agent can call a 'research' worker tool and incorporate the response into its answer.

### `ORC-16` Implement ACP server adapter for OpenClaw/Codex interop  ★ · L · missing

- **Reference:** hermes-agent/acp_adapter/server.py AcpServer class exposing Hermes via ACP protocol; acp_adapter/session.py SessionManager + events.py callbacks
- **Muse approach:** Create packages/acp/src/acp-server.ts (if not already present) implementing ACP protocol server: (1) expose agent-card.json, (2) handle new_session/load_session/send_message/interrupt, (3) translate between ACP message shapes and Muse's internal RunInput/RunResult. Muse already has packages/a2a; ACP is a superset. Serve over HTTP+WebSocket on a local port (default 7000) so OpenClaw Codex instances can launch Muse as a subprocess and talk back via ACP. Fully local — no cloud egress.
- **Value:** Makes Muse a drop-in replacement for OpenClaw's acpx runtime; enables OpenClaw supervisors to orchestrate Muse agents alongside Codex instances in a heterogeneous swarm.
- **Verify:** Test that an OpenClaw supervisor can list Muse sessions and send a message; verify the message routes to an agent and the response flows back.

### `ORC-17` Add agent performance profiling and latency tracking per worker  ★ · M · missing

- **Reference:** openclaw/scripts/bench-gateway-*.ts and test suite performance benchmarks; hermes-agent/gateway performance hooks in callbacks
- **Muse approach:** Create packages/observability/src/agent-metrics.ts with WorkerMetrics: (1) track per-worker stats (total_calls, avg_latency, success_rate, errors), (2) store in Postgres with rolling 7-day retention, (3) expose via API /metrics?worker=code-expert&window=24h. Tie into orchestrator.ts to record latency on each worker run. Use for load balancing (prefer faster workers) and alerting (if a worker's latency spikes, something's wrong with its model).
- **Value:** Supervisors can make data-driven routing decisions (prefer the code-expert worker if it's fast, avoid it if latency is high); ops can diagnose model performance regressions.
- **Verify:** Test that worker latencies are recorded and aggregated; that a slow worker is deprioritized on the next request.

### `ORC-18` Add council-based worker selection (plurality voting on canHandle scores)  ★ · L · missing

- **Reference:** openclaw arXiv:2605.02801 MAST worker selection via multi-agent council vote; Muse/packages/agent-core/src/council.ts council orchestration
- **Muse approach:** Create packages/multi-agent/src/council-worker-selector.ts implementing CouncilWorkerSelector: (1) run canHandle in parallel across multiple 'selector agents' (e.g., 3 specialized decision-makers), (2) each scores workers independently, (3) aggregate via plurality vote, (4) select the highest-scored worker. More robust than single supervisor ranking (arXiv:2605.02801 finding). Muse already has council orchestration in agent-core; reuse council.ts's voting logic. A selector agent is just a lightweight classifier (30 token model)..
- **Value:** More robust worker selection; harder to fool or manipulate compared to a single supervisor's ranking heuristic.
- **Verify:** Test that a council of 3 selectors correctly identifies the best worker more often than 1 selector alone.

## 9. Channels & Integrations · Messaging · Webhooks · Inbound Routing

_19 items_


### `CHN-1` Implement generic webhook receiver for inbound integrations  ★★★★★ · M · missing

- **Reference:** hermes-agent: /Users/jinan/ai/hermes-agent/gateway/platforms/webhook.py (200+ lines of WebhookAdapter handling HTTP POST, HMAC validation, route-based delivery dispatch)
- **Muse approach:** Create `packages/messaging/src/webhook-receiver.ts` that implements a local HTTP server (Node's `http` module) to listen on a configurable port, validate HMAC-SHA256 signatures per route, parse JSON payloads into InboundMessage shape, and dispatch to agent via inbound-responder. Routes are stored in a local JSON file (webhook-subscriptions.json) alongside inbox storage. Fail-close on signature mismatch (deterministic guard).
- **Value:** Enables Muse to ingest from GitHub, GitLab, Stripe, monitoring systems, and other webhook-emitting SaaS without polling—a core missing inbound path that competitors support natively.
- **Verify:** Integration test: POST a signed JSON payload to the receiver, verify it lands in inbox-store and renders in inbox context; POST with wrong signature should reject with 401.

### `CHN-2` Implement thread-aware message routing with origin tracking  ★★★★★ · M · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/extensions/slack/src/channel.ts + thread-ownership plugin; hermes-agent: gateway/delivery.py thread_metadata_for_source(), _reply_anchor_for_event()
- **Muse approach:** Extend `InboundMessage` and `OutboundMessage` in `packages/messaging/src/types.ts` to carry optional `threadId` / `replyToId`. Update `packages/messaging/src/inbound-thread-store.ts` to group messages by (source, threadId) so multi-turn conversations stay coherent. Providers (Slack, Discord, Telegram topics) pass thread metadata on inbound; outbound routes use it for native-threaded replies.
- **Value:** Enables Muse to maintain threaded conversations natively in Slack/Discord/Telegram forums, vastly improving UX when the agent is part of an ongoing discussion rather than isolated replies.
- **Verify:** Slack inbound test: send a message in a thread (thread_ts present), verify inbound_thread_store groups it; send outbound with threadId, verify Slack provider routes to thread_id parameter.

### `CHN-3` Add delivery-routing logic to support multi-platform delivery targets  ★★★★ · M · partial

- **Reference:** hermes-agent: /Users/jinan/ai/hermes-agent/gateway/delivery.py (DeliveryTarget.parse, delivery routing by 'telegram:123', 'origin', 'local', platform-specific rules)
- **Muse approach:** Extend `packages/messaging/src/types.ts` to add `DeliveryTarget` type supporting 'telegram:chatid', 'slack:channel', 'discord:channel', 'origin' (back to source), 'local' (inbox-only). In `packages/messaging/src/outbound-router.ts` (new), implement `routeMessageToTarget()` that parses the target string and dispatches to the appropriate provider. Local-only policy gate enforces cloud egress refusal.
- **Value:** Allows agent responses to be routed not just to the source channel but to explicit named targets (e.g., 'notify on-call via telegram:12345'), and supports local-only fallback ('origin' → back to where the inbound came from).
- **Verify:** Unit test: parse 'telegram:123456789' → {platform: telegram, chatId: '123456789'}; parse 'origin' → mirrors SessionSource; send to 'discord:C123ABC' routes to Discord provider with destination C123ABC.

### `CHN-4` Add approval-gate enforcement for outbound delivery targets  ★★★★ · M · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/extensions/slack/src/approval-native.ts; Muse already has channel-approval-gate but only for inbound-source approval
- **Muse approach:** Enhance `packages/messaging/src/channel-approval-gate.ts` to add outbound-target approval flow: before send, check if target is in allowlist; if not and requires approval, store in pending-approval-store and notify user via safe channel (e.g., local notifications). Resume on user confirmation message (e.g. 'approve telegram:12345'). Deterministic guard, no LLM judgment.
- **Value:** Prevents agent from sending unsolicited messages to new/untrusted targets without explicit human approval—critical safety rail for local-first agents with inbound surface.
- **Verify:** Unit test: agent tries to send to unapproved 'telegram:new_chat', approval-gate blocks and records PendingApproval; user sends 'approve telegram:new_chat', gate clears and next send succeeds.

### `CHN-5` Implement per-provider rate-limiting and in-flight request tracking  ★★★ · M · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/extensions/webhooks/src/http.ts createFixedWindowRateLimiter(), createWebhookInFlightLimiter(); hermes-agent: gateway/platforms/base.py _float_env() + rate-limit tracking
- **Muse approach:** Create `packages/resilience/src/rate-limiter.ts` with fixed-window rate limiter (per-provider, per-destination) and in-flight request semaphore. Each provider's send() calls `rateLimiter.checkQuota()` before attempt; on 429/rate-limit response, sleep and retry (with exponential backoff). Store state in memory (acceptable for local-first) with optional DB persistence for multi-turn consistency.
- **Value:** Prevents hammering platform APIs and getting rate-limited, which would cause message loss; also detects upstream abuse/misconfiguration early before retry storms.
- **Verify:** Test: send 50 messages rapid-fire to one provider with rate limit of 10/min, verify queued and rate-limited; monitor doesn't exceed ceiling.

### `CHN-6` Implement per-channel message history / conversation threading store  ★★★ · M · partial

- **Reference:** openclaw: slack src/sent-thread-cache.ts; hermes-agent: gateway/session.py SessionSource tracking chat context
- **Muse approach:** Extend `packages/messaging/src/inbound-thread-store.ts` to also store outbound messages keyed by (provider, source, threadId). Create `packages/messaging/src/conversation-context.ts` that returns recent bidirectional conversation (inbound + outbound, chronological) for a source. Used by agent context-engineering to inject conversation history into prompts.
- **Value:** Allows agent to see what it previously said in a channel/thread, reducing hallucination and improving coherence in ongoing conversations. Also enables 'continue previous answer' workflows.
- **Verify:** Test: send outbound, fetch conversation context for that (source, threadId), verify both inbound and outbound messages are present and chronologically sorted.

### `CHN-7` Add per-provider idempotency tracking to prevent duplicate sends on retry  ★★★ · S · missing

- **Reference:** hermes-agent: gateway/platforms/webhook.py _seen_deliveries dict, idempotency_cache with TTL (1 hour); openclaw: task-flow webhook requires revision field for optimistic locking
- **Muse approach:** Create `packages/messaging/src/outbound-idempotency-store.ts` that stores (provider, destination, message_hash, timestamp) in a local JSON file. Before send, check if this exact message was sent in the last N hours; if yes, return cached receipt instead of re-sending. On success, record with TTL. Deterministic deduplication (no LLM).
- **Value:** Prevents duplicate messages to users when the agent retries on network failure or when the user re-triggers the same request—critical for reliability in local-first systems without cloud transactionality.
- **Verify:** Test: send message, simulate send failure + retry, verify second attempt finds cached entry and returns same receipt without actually sending twice.

### `CHN-8` Add inbound message deduplication and replay attack prevention  ★★★ · S · missing

- **Reference:** hermes-agent: gateway/platforms/webhook.py _seen_deliveries + idempotency_cache; hermes-agent: delivery.py _is_silence_narration() for content-based dedup
- **Muse approach:** Create `packages/messaging/src/inbound-deduplication.ts` that stores (providerId, source, messageId, timestamp) in a local JSON file. On inbound, check if messageId was already processed; if yes, skip. Also add content-based dedup for silence narrations ('(silent)', '…', etc.) to ignore no-op responses. Use TTL-based cleanup to bound file size.
- **Value:** Prevents duplicate processing of the same message if a provider retries webhook delivery or polling fetches the same message twice—critical for reliability and avoiding duplicate agent runs.
- **Verify:** Test: POST webhook twice with same messageId, verify second one is rejected as duplicate; send inbound twice from same source (same messageId), verify second is skipped.

### `CHN-9` Implement multi-provider fan-out for critical notifications  ★★★ · M · missing

- **Reference:** hermes-agent: gateway/delivery.py fallback delivery chains (try primary, fall back to secondary); openclaw: channel-plugin-api router with fallback
- **Muse approach:** Create `packages/messaging/src/fan-out-router.ts` that takes a list of delivery targets and sends to all (or first-success). On send, collect all receipts and return array. Agent can specify 'notify(targets: ["telegram:12345", "discord:C123", "local"])' to ensure redundancy. Fail-close: if all targets fail, raise error instead of silent drop.
- **Value:** Enables critical notifications to reach user via multiple channels (e.g., ping Telegram AND Discord), reducing chance of missed alerts. Also enables graceful degradation: try primary platform, fall back to local storage if all fail.
- **Verify:** Test: send to [telegram, discord, local], verify all three receive message; simulate one provider failure, verify other two succeed; all fail → error raised.

### `CHN-10` Add provider-specific message format transformations and entity escaping  ★★ · S · partial

- **Reference:** hermes-agent: gateway/platforms/base.py utf16_len(), _prefix_within_utf16_limit() for Telegram; openclaw: slack escapeSlackText(), Discord markdown handling
- **Muse approach:** Create `packages/messaging/src/message-formatters.ts` with platform-specific text sanitizers: Slack link wrapping (<channel|name>), Discord markdown escaping, Telegram HTML entity escaping, LINE text limitation (2000 chars). Providers call `.format()` before send(); allows rich future payloads (embeds, buttons) to transform per-platform.
- **Value:** Prevents formatting bugs (Slack links rendered as raw URLs, Discord codeblocks breaking, Telegram truncation) and enables richer outputs (embeds, buttons) when platform-specific message types are added later.
- **Verify:** Unit test: send message with Slack channel reference, verify <channel|name> wrapping; send message with emoji to Telegram, verify UTF-16 length counting; send long Discord message, verify markdown preserved.

### `CHN-11` Implement message chunking / splitting for platforms with length limits  ★★ · M · partial

- **Reference:** hermes-agent: gateway/platforms/base.py should_send_media_as_audio(), _custom_unit_to_cp() and truncate_message(); Muse has clamp logic but no auto-chunking
- **Muse approach:** Create `packages/messaging/src/message-chunker.ts` with per-provider chunking strategy: Slack/Discord/Telegram split on 4000-char boundaries with overlap markers ('...[cont'd]...'), LINE splits with '[1/3]' footer. Providers with native chunking support (Discord embeds) use that; text-only default to simple newline chunking. Store chunks in outbound-idempotency-store to track all parts of a multi-part send.
- **Value:** Allows long agent responses (e.g. detailed analysis, code diffs) to be delivered without truncation; improves user experience for verbose outputs.
- **Verify:** Test: send 8000-char message to Telegram with 4000-char limit, verify split into 2 messages with continuation markers; verify both land in conversation context.

### `CHN-12` Add provider-agnostic sender identity tracking (user/bot account metadata)  ★★ · S · partial

- **Reference:** hermes-agent: gateway/session.py SessionSource.platform + user_id / chat_id fields; openclaw: accounts.runtime.ts resolveSlackAccount() for multi-account support
- **Muse approach:** Extend `InboundMessage` and `OutboundMessage` in `packages/messaging/src/types.ts` to carry optional `accountId` (e.g., 'slack:bot_user_xoxb_...', 'telegram:my_bot_token'). In `packages/autoconfigure/src/personal-providers.ts`, track which account/token is wired for each provider. Allows multi-account setups where different Slack bots or Telegram accounts deliver to different channels.
- **Value:** Enables advanced setups where Muse uses different credentials per channel/provider (e.g., separate bot account per Slack workspace), and tracks which account sent each message for audit/context.
- **Verify:** Test: configure two Slack bot tokens, verify inbound messages from each workspace carry correct accountId; send outbound with explicit accountId, verify correct token is used.

### `CHN-13` Implement delivery failure callback and async delivery status tracking  ★★ · M · missing

- **Reference:** hermes-agent: gateway/platforms/base.py _POST_DELIVERY_CALLBACK_TIMEOUT_SECONDS, post-delivery-callback logic; openclaw: webhooks http.ts describeWebhookOutcome() with detailed error codes
- **Muse approach:** Create `packages/messaging/src/delivery-status-store.ts` that records (messageId, status, errorCode, timestamp, retryCount) for each outbound. Add optional `deliveryCallbackUrl` to OutboundMessage so agent can request a callback when message is delivered/failed. Scheduler daemon polls provider's API (Discord reactions, Slack message status, etc.) to update delivery status.
- **Value:** Allows agent to know whether a message actually reached the user or failed silently, enabling workflows like 'if delivery failed, escalate to on-call' or 'retry critical alerts'.
- **Verify:** Test: send message, simulate delivery failure on provider side, verify delivery-status-store records failure with error code; verify callback URL is called with status if provided.

### `CHN-14` Implement per-provider configuration schema validation and credential rotation  ★★ · S · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/extensions/slack/src/config.ts (extensive Zod schemas); hermes-agent: gateway/config.py PlatformConfig with extra fields per adapter
- **Muse approach:** Create `packages/messaging/src/provider-config.ts` with Zod schemas for each provider (token format, base URLs, timeouts, rate limits, etc.). In `packages/autoconfigure/src/messaging-poll-dispatchers.ts`, validate config at startup. Add `packages/messaging/src/credential-rotation.ts` to support graceful token updates: new token is tested before old is removed, preventing downtime.
- **Value:** Prevents misconfigurations (malformed tokens, wrong provider IDs) from silently causing sends to fail; enables credential rotation without downtime (e.g., when token expires).
- **Verify:** Test: configure invalid Slack token format, verify startup error with clear message; rotate token, verify sends work with new token before old is removed.

### `CHN-15` Add channel discovery and enumeration for all providers  ★★ · M · partial

- **Reference:** openclaw: slack src/resolve-channels.ts listChannels(); hermes-agent: gateway/platforms/base.py list_channels(); Discord/Telegram list_chats()
- **Muse approach:** Create `packages/messaging/src/channel-discovery.ts` with per-provider discovery methods: Slack conversations.list, Discord guilds.getChannels, Telegram getChats (premium bot API), LINE getGroupSummary. Muse agent can query 'list_channels(provider="slack")' to get available destinations. Cache results with TTL. Optional: store in db for smart autocomplete.
- **Value:** Allows user/agent to discover available channels without manual config; enables workflows like 'post update to all #engineering channels' (fan-out by pattern matching).
- **Verify:** Test: call list_channels('slack'), verify returns array of {id, name, isPrivate, memberCount}; call list_channels('telegram'), verify returns chat list; results are cached.

### `CHN-16` Add message delivery feedback loop: detect provider errors and emit observability signals  ★ · S · partial

- **Reference:** hermes-agent: gateway/delivery.py _send_result_failed(), _send_result_error(); openclaw: webhooks http.ts mapMutationStatus() with detailed error code mapping
- **Muse approach:** Create `packages/observability/src/messaging-signals.ts` that emits structured logs when send fails (error code, retry count, duration, upstream error). Providers catch provider-specific errors (e.g., Slack 'channel_not_found', Telegram 'user_blocked') and map to standard error codes (CHANNEL_UNKNOWN, USER_BLOCKED, RATE_LIMITED, etc.). Agent can inspect these signals to decide retry strategy.
- **Value:** Provides visibility into why sends are failing (e.g., 'user_blocked' vs 'network_error') so agent and user can take appropriate action; improves debugging of integration issues.
- **Verify:** Integration test: send to invalid Slack channel, capture observability signal with error code 'CHANNEL_NOT_FOUND'; verify agent can access signal and decide recovery action.

### `CHN-17` Add support for rich message payloads (embeds, buttons, file attachments)  ★ · L · missing

- **Reference:** openclaw: slack src/send.runtime.ts with blocks/attachments; hermes-agent: gateway/platforms/base.py send_media_as_audio(), media handling; WhatsApp/Telegram media APIs
- **Muse approach:** Extend `OutboundMessage` in `packages/messaging/src/types.ts` to support optional `rich` field carrying platform-agnostic payload shape (title, description, buttons, imageUrl, etc.). Each provider's send() transforms into native format: Slack blocks, Discord embeds, Telegram HTML + inline buttons, etc. Media attachments stored locally with hash-based dedup in outbound-idempotency-store.
- **Value:** Enables richer agent outputs: structured cards, buttons/actions, file links, images—moving beyond plain text and matching what competitors offer natively.
- **Verify:** Test: create rich payload with title+description+button, send to Slack → verify blocks rendered; send to Telegram → verify HTML + inline button; send to Discord → verify embed.

### `CHN-18` Implement message editing and deletion support for delivered messages  ★ · M · missing

- **Reference:** openclaw: Slack src/send.runtime.ts chat.update for edits; Telegram/Discord APIs support message.edit(); hermes-agent: gateway delivery tracking for amendment
- **Muse approach:** Extend `OutboundReceipt` to carry `canEdit` / `canDelete` flags. Create `packages/messaging/src/outbound-amendment.ts` with `editMessage()` and `deleteMessage()` that each provider implements if the platform supports it. Store receipt metadata (messageId, channelId, provider) in outbound-idempotency-store. Agent can later call 'edit message X with new text' or 'delete message X'.
- **Value:** Allows agent to fix mistakes (typos, incorrect data) by editing sent messages, or clean up spam/errors by deletion—improves user experience and trust.
- **Verify:** Test: send message to Slack, get receipt, call editMessage() with new text, verify Slack message is updated; call deleteMessage(), verify message is removed.

### `CHN-19` Implement reusable provider-agnostic message templates for common patterns  ★ · M · missing

- **Reference:** hermes-agent: gateway/platforms/base.py message formatting; openclaw: slack blocks/progress-blocks.ts template system
- **Muse approach:** Create `packages/messaging/src/message-templates.ts` with TypeScript template functions for common patterns: alert (title, severity, action), update (status, percentage, eta), listing (title, items, pagination). Templates accept platform-agnostic params and output format appropriate to each provider. Agent calls `alertTemplate({title, severity, action})` and it renders as Slack emoji+bold, Discord color-coded embed, Telegram HTML, etc.
- **Value:** Reduces boilerplate for agent when outputting structured messages; ensures consistent UX across platforms; enables theme/style updates in one place.
- **Verify:** Test: use alertTemplate({title: 'Deployment failed', severity: 'critical', action: 'Rollback'}), send to Slack/Discord/Telegram, verify each renders appropriately with correct styling.

## 10. Voice · Speech · Media Gen/Understanding · Document Extract

_19 items_


### `MED-1` STT provider registry + dispatch abstraction  ★★★★★ · M · missing

- **Reference:** hermes-agent: /Users/jinan/ai/hermes-agent/agent/transcription_registry.py + transcription_provider.py — pluggable STT backend registry with built-in (Whisper, local_command, Groq, OpenAI, Mistral, xAI) + plugin extensibility, provider selection via config.yaml stt.provider
- **Muse approach:** Create /Users/jinan/side-project/Muse/packages/voice/src/sttt-registry.ts implementing a thread-safe provider map (like hermes) with a SpeechToTextProvider ABC defining name, is_available(), list_models(), get_setup_schema(), and transcribe(file_path, model?, language?). Built-ins (WhisperCpp, Piper via local pipe, local command via shell) always win over plugins. Muse's local-only constraint eliminates cloud STT providers from being RUNTIME owners, but the abstraction allows user-installed plugin providers (OpenRouter Whisper, Deepgram via user setup).
- **Value:** Unifies Muse's scattered STT implementations (openai-whisper.ts, whisper-cpp.ts) into one dispatcher, enabling tool-layer routing of transcribe_audio to the selected active provider without hardcoded conditionals.
- **Deps:** voice package (existing WhisperCpp, OpenAIWhisper implementations); agent-core (tool dispatch)
- **Verify:** Unit test: register WhisperCppSttProvider and OpenAIWhisperSttProvider, confirm built-in takes precedence when both configured; integration test: transcribe_audio tool routes to correct provider based on stt.provider config key.

### `MED-2` Document text + image extraction (PDF-first)  ★★★★★ · L · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/extensions/document-extract/document-extractor.ts — extracts text (max 200K chars) + images from PDFs via clawpdf engine; handles passwords, page selection, image quality/dimension limits; returns {text, images: [{type, data: base64, mimeType}]}
- **Muse approach:** Create /Users/jinan/side-project/Muse/packages/document-extraction/src/pdf-extractor.ts. Use a local PDF library (PDF.js for node, or pdfium via wasm). Extract text via text layer first; if text is sparse (< minTextChars threshold), extract images (max dimension 10K, format to PNG base64). Attach extracted images as VisionExtractInput attachments so vision-extract.ts can OCR them locally. Return {text: string, images: [{data: base64, mimeType: 'image/png'}], pageCount: number}.
- **Value:** Enables grounded vision actions on document PDFs (snap receipt photo, upload invoice PDF → extract merchant+total+date → draft expense note, gate on grounding verification). Unlocks drafting from both photos and PDFs with unified extraction pipeline.
- **Deps:** vision-extract (agent-core); PDF.js or pdfium library (new dep); shared (base64 utils)
- **Verify:** Test: extract a 3-page receipt PDF (text + images), confirm text ≤ 200K chars, image count correct; grounding test: pass extracted images to vision-extract.ts, confirm OCR finds document text.

### `MED-3` TTS persona registry + multi-voice fallback chain  ★★★★ · M · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/src/tts.ts lines 384-401 (collectTtsPersonas) + 810-846 (resolveTtsPersonaFromPrefs + getTtsPersona + setTtsPersona + listTtsPersonas) — TTS personas as named config entries with per-persona provider bindings, persona override in user prefs, fallback chain (persona → provider config → defaults)
- **Muse approach:** Extend /Users/jinan/side-project/Muse/packages/voice/src/registry.ts to add a TtsPersona interface (id, label?, description?, provider, providers: {[providerId]: SpeechProviderConfig}) + TtsPersonaRegistry that reads from config.agents.defaults.ttsPersonas + persists to userPrefs.tts.persona. Implement resolveTtsPersona(config, prefsPath) → ResolvedTtsPersona | undefined following openclaw's three-tier fallback (user prefs persona → active persona from config → none).
- **Value:** Enables per-voice personality control (e.g., 'narrator', 'casual', 'formal') with provider-specific voice bindings (Piper English male, OpenAI Alloy, etc.), landing user voice preference persistence without hardcoding.
- **Deps:** voice package (registry); model (config schema updates)
- **Verify:** Test: set persona in prefs, confirm getTtsPersona returns it; switch to another persona, confirm prefs update; fallback chain test: persona missing provider binding falls back to config default or none.

### `MED-4` TTS streaming synthesis surface  ★★★★ · L · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/src/tts.ts lines 1570-1699 (streamSpeech function) — streams audio in chunks via ReadableStream, with provider fallback chain and latency tracking; returns TtsSynthesisStreamResult with release() cleanup
- **Muse approach:** Add streamTextToSpeech(text, cfg, options) → Promise<{success, audioStream?: ReadableStream<Uint8Array>, error?, latencyMs?, release?: () => Promise<void>}> to /Users/jinan/side-project/Muse/packages/voice/src/openai-tts.ts and piper.ts. Implement fallback chain (primary provider → fallback providers) with attempt tracking. For Piper (local), use child_process.spawn() to stream raw PCM and wrap in ReadableStream. For OpenAI, use their chunk streaming when available.
- **Value:** Enables low-latency voice output for voice-mode UI (progressive audio playback instead of buffering full response), critical for interactive agent conversations.
- **Deps:** voice package (TTS providers); shared (stream utilities)
- **Verify:** Integration test: stream a 100-char prompt, consume stream in chunks, confirm release() cleanup happens; fallback test: primary fails, stream switches to fallback with latencyMs reflecting overall attempt.

### `MED-5` Structured document metadata extraction  ★★★★ · L · missing

- **Reference:** hermes-agent: /Users/jinan/ai/hermes-agent/agent/image_gen_provider.py (parallel pattern) — abstractly, the image generation provider dynamically declares modalities (text, image) via capabilities(), so a unified tool routes user input to the right provider mode. Document extraction applies the same pattern: declare what document types a provider supports and route to the right extraction handler.
- **Muse approach:** Create /Users/jinan/side-project/Muse/packages/document-extraction/src/document-processor.ts implementing extractStructuredFromDocument(buffer, mimeType, schema, instruction) → Promise<{ok, data?, raw, error?}> (mirrors vision-extract.ts). For PDF: first try text extraction; if sparse, extract images and route to vision-extract.ts (OCR path). For DOCX/XLSX: parse via local library (docx, xlsx), convert to text, apply structured extraction. Temperature-0 structured output (responseFormat: schema) enforces schema compliance. Grounding floor: omit non-visible fields, never invent.
- **Value:** Automates processing of uploaded documents (invoices, contracts, expense reports) into structured fields (date, amount, vendor, signatory) without cloud APIs, landing grounded vision actions for document workflows.
- **Deps:** vision-extract (agent-core); pdf-extractor (above); docx, xlsx libraries (new deps)
- **Verify:** Test: extract invoice PDF with schema {required: [merchant, total, date]}, confirm fields match visible text; failure test: omit visible total, extraction fails closed; XLSX test: spreadsheet row → structured extraction.

### `MED-6` Image generation provider registry (local + remote dispatch)  ★★★★ · M · missing

- **Reference:** hermes-agent: /Users/jinan/ai/hermes-agent/agent/image_gen_provider.py + image_gen_registry.py — unified text-to-image and image-to-image dispatch; providers declare modalities (text, image) + max_reference_images; routing: if image_url present → image-to-image else text-to-image
- **Muse approach:** Create /Users/jinan/side-project/Muse/packages/image-generation/src/image-gen-registry.ts + image-gen-provider.ts. Define ImageGenProvider ABC (name, display_name, is_available(), list_models(), capabilities() → {modalities, max_reference_images}, generate(prompt, aspect_ratio, image_url?, reference_image_urls?) → {success, image, model, prompt, aspect_ratio, modality, provider, error?}). Registry is route-layer only — Muse's local-only policy means built-in implementations must be LOCAL (stable diffusion via Ollama/ComfyUI socket, or refuse cloud). User-installed plugins can register cloud providers (OpenAI, FAL, etc.) but are opt-in via explicit allow-list (fail-close).
- **Value:** Unifies image generation tool dispatch for Muse, enabling agent to request text-to-image OR image editing via one interface; local-first implementations (Ollama diffusion) satisfy local-only constraint.
- **Deps:** model (config); shared (image format utils); new image-generation package
- **Verify:** Unit test: register local StableDiffusion provider + OpenAI provider, confirm local is first candidate; tool test: pass image_url → modality: 'image' returned; no image_url → modality: 'text'; capabilities() test: declare max_reference_images: 3, agent sees it in dynamic schema.

### `MED-7` Vision input grounding verification (image OCR confidence gate)  ★★★★ · M · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/src/tts.ts + vision-extract.ts — uses two independent calls (classify image, then extract by kind + transcribe all text for verification) to gate hallucination; Muse apps/cli/src/vision-actions.ts already implements this for receipts/events
- **Muse approach:** Extend /Users/jinan/side-project/Muse/packages/agent-core/src/vision-extract.ts to add verifyExtractionAgainstEvidence(extracted, imageBase64) → Promise<{verified: string[], unverified: string[]}>. Call independent OCR pass on image (temperature 0, instruction: 'transcribe EVERY piece of visible text') and compare digit-runs + word tokens against extracted fields. A field is verified if its key tokens appear in evidence transcript. This is ALREADY working in vision-actions.ts; refactor into vision-extract.ts as a reusable gate. Return {verified, unverified} so agent knows which fields are grounded.
- **Value:** Prevents fabricated vision extraction fields from leaking into persisted data (calendar events, contacts, expense notes); deterministic code-based gate (not prompt-based) means it reliably blocks hallucinations.
- **Deps:** agent-core (vision-extract); shared (token matching utils)
- **Verify:** Test: extract {merchant: 'Acme', total: '$50'} from receipt, verification finds both in evidence → verified: [merchant, total]; extract {tax: '$5'} (not visible) → unverified: [tax]; agent sees unverified list, refuses auto-apply.

### `MED-8` Audio codec auto-transcode routing  ★★★ · M · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/src/tts.ts lines 1375-1418 (maybePreTranscodeForVoiceDelivery) — detects channel audio format requirements, transcodes audio buffer pre-delivery (e.g., MP3→WAV for telephony, OGG→MP3 for web)
- **Muse approach:** Add audioTranscodeRouter(audioBuffer, sourceFormat, targetFormat?, channel?) → Promise<{audioBuffer, format, extension}> to /Users/jinan/side-project/Muse/packages/voice/src/audio-transcode.ts using ffmpeg-wasm or node-ffmpeg (local-only, no cloud codec service). Channel-aware routing checks delivery.preferAudioFileFormat and transcodesAudio flags from channel registry. If transcode fails, returns original buffer + warning log (fail-soft, like openclaw).
- **Value:** Ensures voice output compatibility across Muse delivery channels (macOS native voice note, browser HTML5, messaging APIs) without manual codec selection by users.
- **Deps:** voice package; macos package (channel registry); ffmpeg-wasm or node-ffmpeg (new optional dep)
- **Verify:** Test: route Piper WAV through channel needing MP3, confirm transcode occurs and buffer is smaller; fallback test: ffmpeg unavailable, original buffer returned with log warning.

### `MED-9` Stable Diffusion image generation (local via Ollama/ComfyUI)  ★★★ · M · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/extensions/openai/image-generation-provider.ts as reference pattern; hermes plugin model: comfyui, fal, xai providers in /Users/jinan/ai/hermes-agent/plugins/image_gen/
- **Muse approach:** Create /Users/jinan/side-project/Muse/packages/image-generation/src/stable-diffusion-provider.ts. Implement ImageGenProvider for Ollama's local diffusion models (SDXL, SD1.5 if available). Use Ollama's HTTP API (localhost:11434/api/generate with vision/image params). For text-to-image: POST {model, prompt, aspect_ratio} to /api/generate. For image-to-image: encode reference_image to base64, include in request body (check Ollama's image conditioning API). Fallback gracefully if Ollama unavailable (is_available() returns false, tool skips provider). Return {image: base64 PNG, model, prompt, aspect_ratio, modality: 'text'|'image', provider: 'ollama-diffusion'}.
- **Value:** Enables local image generation without cloud APIs, satisfying local-only constraint; Ollama socket availability (already in voice-mode setup) makes this nearly free.
- **Deps:** image-generation (registry); model (config for Ollama socket); shared (base64 image utils)
- **Verify:** Test: POST to Ollama diffusion model with prompt, confirm PNG base64 returned; image-to-image test: pass reference image, confirm modality: 'image'; Ollama unavailable test: is_available() returns false.

### `MED-10` Vision-to-action routing with multi-provider fallback  ★★★ · M · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/src/tts.ts lines 1461-1565 (provider fallback loop: for each candidate, try synthesis, on error push attempt + fallback) — fail-soft attempt tracking + latency per provider
- **Muse approach:** Extend /Users/jinan/side-project/Muse/packages/agent-core/src/vision-extract.ts. Current extractStructuredFromImage() uses provider.generate() directly. Refactor to resolveVisionProviders(model?, cfg?) → VisionProviderCandidate[] (primary + fallbacks per openclaw pattern), then loop: for each provider candidate, try extraction, on error record attempt + fallback reason. Return {ok, data?, error?, attempts?: [{provider, outcome, reasonCode, latencyMs, error?}]}. This mirrors TTS fallback chain, enabling agent to gracefully degrade when Ollama vision unavailable (e.g., swap to OpenAI Gemini if available).
- **Value:** Hardens vision extraction against single-provider failures; enables A/B testing of vision models locally (gemma4 → Llava → OpenAI fallback chain) with diagnostic attempt tracking.
- **Deps:** agent-core (vision-extract); voice (provider registry pattern as template)
- **Verify:** Test: extraction with gemma4, confirm success + attempts=[{provider: 'ollama:gemma4', outcome: 'success', latencyMs}]; Ollama unavailable test: fallback to OpenAI (if configured), confirm attempts shows both attempts.

### `MED-11` Speech-to-speech (STT → LLM → TTS) voice loop  ★★★ · L · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/src/tts.ts + voice-models.ts — voice model refs (provider + timeoutMs) enable chaining STT output through agent → TTS, with per-model timeout overrides
- **Muse approach:** Add voice-loop orchestrator to /Users/jinan/side-project/Muse/packages/voice/src/voice-loop.ts: transcribeAndRespond(audioBuffer, agentContext) → Promise<{transcription, agentResponse, audioPath, attempts}). Flow: (1) transcribeAudio(buffer) via STT registry, (2) pass transcript + context to agent.run(), (3) synthesizeSpeech(response.output) via TTS registry with fallback chain. Return {transcription, agentResponse, audioPath, attempts: [{stage: 'stt'|'tts', provider, latencyMs}]}. Grounding: transcription confidence reported by STT provider gated in agent system prompt (low confidence → 'clarify what you said' priming).
- **Value:** Unifies voice I/O into one endpoint for voice-mode UI and interactive agents; enables true voice conversation without manual transcript-response coupling.
- **Deps:** voice (sttt-registry, tts-registry, streaming); agent-core (agent.run); shared (audio buffer utils)
- **Verify:** Integration test: feed audio buffer (voice memo), confirm transcription → agent response → audio output chain works; fallback test: STT fails, error propagates; TTS fails, agent response is text-only.

### `MED-12` Speech provider voice model selection  ★★★ · M · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/voice-models.ts — declares voice model refs per provider (e.g., {provider: 'openai', model: 'tts-1', voice: 'alloy'}) and routes by provider + voice availability
- **Muse approach:** Extend /Users/jinan/side-project/Muse/packages/voice/src/types.ts + registry.ts to include VoiceModelRef interface (provider, model, voice, label, timeoutMs?). Add resolveVoiceModels(cfg, providerId) → VoiceModelRef[] (returns available voice models for a provider). TTS providers expose listVoices() → {id, label, description}[] (Piper returns {id: 'en_US-libritts-high', label: 'English US LibriTTS'}, OpenAI returns {id: 'alloy', label: 'Alloy (male, neutral)'}). Agent system prompt includes hint: 'available voices: alloy, nova, shimmer' so it can request specific voice via [[tts:voice=alloy]] directive (already in voice-mode.md design).
- **Value:** Enables agent + user to request specific voice (persona binding) without hardcoding provider details; mirrors openclaw's voice model selection UX.
- **Deps:** voice (types, registry, provider adapters); agent-core (directive parsing already exists)
- **Verify:** Test: Piper provider, resolveVoiceModels returns en_US variants; OpenAI provider returns alloy/nova/shimmer; agent system prompt includes voice hint; [[tts:voice=nova]] parsed and routed correctly.

### `MED-13` Video generation provider abstraction (text-to-video + image-to-video)  ★★ · M · missing

- **Reference:** hermes-agent: /Users/jinan/ai/hermes-agent/agent/video_gen_provider.py — unified text-to-video + image-to-video dispatch with capabilities (modalities, aspect_ratios, resolutions, max_duration, supports_audio, max_reference_images); response: {success, video, model, prompt, modality, aspect_ratio, duration, provider, error?}
- **Muse approach:** Create /Users/jinan/side-project/Muse/packages/video-generation/src/video-gen-provider.ts + video-gen-registry.ts. Mirror image-gen pattern: VideoGenProvider ABC with generate(prompt, aspect_ratio?, image_url?, ...) → {success, video, model, prompt, modality: 'text'|'image', aspect_ratio, duration, provider, error?}. Routing: image_url present → image-to-video else text-to-video. Local-only: no built-in local video gen (hardware cost too high for commodity machines); registry exists for user-installed plugins (FAL, xAI, etc.) via allow-list. Fail-close: if no provider configured, return error rather than hallucinate.
- **Value:** Establishes video generation surface for future local-or-user-installed provider expansion; prevents agent from attempting video generation without explicit configuration.
- **Deps:** model (config); shared (media format utils); new video-generation package
- **Verify:** Unit test: video-gen-registry empty, tool call returns error 'no video generation provider configured'; plugin registration test: FAL provider registered, tool routes prompt to FAL with modality detection.

### `MED-14` Music generation provider abstraction  ★★ · M · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/src/music-generation/ — unified music generation with modes (generate vs edit), capabilities (maxTracks, supportsLyrics, supportsInstrumental, supportsDuration, supportedFormats), generation (prompt, lyrics?, instrumental?, durationSeconds?, format?) → {tracks: [{buffer, mimeType, fileName}], model, lyrics?, metadata?}
- **Muse approach:** Create /Users/jinan/side-project/Muse/packages/audio-generation/src/music-gen-provider.ts + music-gen-registry.ts. Define MusicGenProvider ABC (name, capabilities() → {supportsLyrics, supportsInstrumental, maxTracks, supportedFormats}, generateMusic(prompt, lyrics?, instrumental?, durationSeconds?, format?) → {tracks: [{buffer, mimeType}], model, error?}). Like video-gen: no local built-in (model size prohibitive); registry for user-installed plugins (Google MusicLM, xAI, FAL, etc.). Muse's local-only gate: MUSE_LOCAL_ONLY=on blocks non-local providers at runtime assembly (fail-close).
- **Value:** Establishes music generation surface in Muse; enables future expansion to local TTS-like music or user-installed cloud plugin (xAI, Google); prevents agent from attempting music generation without explicit opt-in.
- **Deps:** model (config); shared (audio format utils); new audio-generation package
- **Verify:** Registry test: no providers registered, tool returns 'music generation not available'; plugin registration: xAI provider registered, tool routes with capabilities checking.

### `MED-15` STT model selection + language hints  ★★ · S · missing

- **Reference:** hermes-agent: /Users/jinan/ai/hermes-agent/agent/transcription_provider.py lines 100-122 — list_models() → [{id, display?, languages?, max_audio_seconds?}]; transcribe(file_path, model?, language?) signature
- **Muse approach:** Add to /Users/jinan/side-project/Muse/packages/voice/src/types.ts: SttModelInfo interface (id, display, languages?, maxAudioSeconds?). Extend SpeechToTextProvider: listModels() → SttModelInfo[]. Whisper and Whisper.cpp return [{id: 'base', languages: ['multi']}, {id: 'small', languages: ['multi']}]. Agent system prompt (voice-mode) includes: 'STT language: auto-detect' (no language override for now, future-proof). Tool layer passes language hint when available (e.g., calendar event with language tag).
- **Value:** Enables future multi-language voice input without code changes; establishes model selection surface (user picks whisper size for accuracy vs latency tradeoff).
- **Deps:** voice (types, registry, stpt-providers)
- **Verify:** Test: Whisper provider lists small/base/large models with language metadata; agent system prompt reflects model list.

### `MED-16` Attachment context for extracted documents/images  ★★ · S · partial

- **Reference:** openclaw: /Users/jinan/ai/openclaw/src/speech-core/src/tts.ts (not attachment-specific); Muse: /Users/jinan/side-project/Muse/packages/agent-core/src/attachment-context.ts lines 21-110 — already parses user-attached files in metadata, surfaces in [Attached Files] section
- **Muse approach:** Extend /Users/jinan/side-project/Muse/packages/agent-core/src/attachment-context.ts to support vision-extract references. When extracting a PDF document or image: call extractStructuredFromDocument() → {text, images}, then add synthetic attachments to metadata: {attachments: [{name: 'extracted_document.pdf', mimeType: 'application/pdf', description: 'Extracted: {merchant, total, date}', ref: <store-id>}]}. Downstream tools can fetch full extracted content by ref. This reuses existing attachment-context rendering without code duplication.
- **Value:** Surfaces extracted document metadata in system prompt so agent sees document extraction results BEFORE tools run, enabling planning (e.g., 'create expense note from {merchant, total}').
- **Deps:** agent-core (attachment-context); document-extraction (above)
- **Verify:** Test: extract PDF invoice, confirm [Attached Files] section includes extracted summary; agent sees it in system prompt.

### `MED-17` Audio fingerprinting + caching for TTS (voice memo dedup)  ★★ · M · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/packages/speech-core/src/tts.ts lines 216-217 (lastTtsAttempt tracking) — not full caching, but status tracking; hermes pattern: plugins can cache generated media
- **Muse approach:** Add /Users/jinan/side-project/Muse/packages/cache/src/tts-audio-cache.ts: computeHash(text + provider + voice + persona) → sha256 hex. On TTS request, check cache.get(hash) before calling provider. If hit, return cached audio + {cached: true, savedLatencyMs}. On success, cache.set(hash, audioBuffer, ttl: 30 days). This prevents re-synthesizing the same phrase (e.g., daily greeting) 100 times. Cache key includes persona/voice so 'hello' in Alloy voice ≠ 'hello' in Shimmer voice.
- **Value:** Reduces TTS latency + provider load for repetitive phrases (greetings, status updates, reminders); improves voice-mode responsiveness for frequently-repeated content.
- **Deps:** cache (existing); voice (tts providers)
- **Verify:** Test: synthesize 'good morning' with voice=alloy twice, confirm second hit returns cached audio + {cached: true}; different voice (shimmer) does not hit cache; cache TTL expires after 30 days.

### `MED-18` Tool-generated image/video caching (media asset lifetime)  ★ · M · missing

- **Reference:** openclaw: /Users/jinan/ai/openclaw/extensions/image-generation-core/src/runtime.ts + video-generation-core — generated assets returned as {buffer, mimeType, fileName}, stored in temp workspace, lifecycle managed by caller (OpenClaw agent cleanup hooks)
- **Muse approach:** Add /Users/jinan/side-project/Muse/packages/cache/src/media-asset-cache.ts: generated images/videos stored with key (tool + params hash) and TTL (7 days for images, 1 day for videos due to disk cost). On tool invocation, check cache.get(hash). If hit, return cached path + {cached: true}. On generation, cache.set(hash, assetBuffer, {ttl, metadata: {tool, promptSummary}}). Cleanup: periodic job removes expired assets. This prevents re-generating identical images when user re-runs prompt.
- **Value:** Reduces image/video generation costs + latency for repeated content requests; improves agent efficiency when handling repetitive creative tasks.
- **Deps:** cache (existing); image-generation, video-generation (above)
- **Verify:** Test: generate 'a cat' image twice, second hit returns cached path; modify prompt slightly ('a black cat'), cache miss triggers new generation; 7-day TTL verified by mock clock.

### `MED-19` Multimodal embedding extraction from documents + images  ★ · L · missing

- **Reference:** hermes-agent + openclaw: no direct multimodal embedding support in either, but both extract text + images separately and assume downstream agents do semantic search. This is a forward-looking item for Muse's semantic memory.
- **Muse approach:** Add /Users/jinan/side-project/Muse/packages/vision/src/multimodal-embedding.ts: embeddingProvider.embed({text, imageBase64?, imageUrl?}) → {embedding: number[], modality: 'text'|'image'|'multimodal', model}. Use local embedding model (CLIP via Ollama, or similar). For documents: extract text → embed; extract images → embed separately, then mean-pool both embeddings. This feeds episodic-memory storage for 'remember this receipt format' / 'similar documents' retrieval (future integration with recall.ts). Grounding: embeddings are deterministic (same text always → same vector), so no fabrication floor needed.
- **Value:** Enables semantic recall of documents, images, and extracted information ('show me receipts like this', 'find similar invoices'), landing better long-term memory UX.
- **Deps:** vision (image handling); recall (episodic-memory); embedding provider (new, local CLIP or similar)
- **Verify:** Test: embed receipt image + text, confirm embedding length consistent; semantic search: embed similar receipt, cosine similarity > 0.8; grounding: same text → same embedding.

## 11. Web · Browser Control · Search Providers · Content Extraction

_18 items_


### `WEB-1` Implement web search provider ABC + registry  ★★★★★ · M · missing

- **Reference:** /Users/jinan/ai/hermes-agent/agent/web_search_provider.py and web_search_registry.py — pluggable ABC with is_available(), supports_search(), supports_extract(), search(), extract() methods; registry resolves active provider by config.yaml key or legacy preference order
- **Muse approach:** Create @muse/web-provider package with TypeScript ABC (WebSearchProvider, WebSearchRegistry) matching hermes's contract. ABC requires name, display_name, is_available(), supports_search(), supports_extract(), search(), extract() methods. Registry implements _resolve() with 3-tier fallback (explicit config, single-eligible shortcut, legacy preference). Land in packages/web-provider/src/provider.ts and registry.ts; loopback-search.ts becomes built-in 'duckduckgo-html' provider instance.
- **Value:** Enables Muse to swap search backends (Firecrawl, Brave, Exa, Tavily, etc.) without forking core logic; unblocks multi-provider testing and operator choice parity with hermes.
- **Verify:** Create searxng and duckduckgo-html provider implementations, wire both into registry, verify resolution rules (config wins, single-eligible shortcut, legacy fallback) with unit tests

### `WEB-2` Implement browser provider ABC + registry for cloud browsers  ★★★★★ · M · missing

- **Reference:** /Users/jinan/ai/hermes-agent/agent/browser_provider.py and browser_registry.py — ABC with name, is_available(), create_session(task_id), close_session(session_id), emergency_cleanup(); registry selects active provider with explicit config + legacy preference (browser-use → browserbase, firecrawl explicit-only)
- **Muse approach:** Create @muse/browser-provider package with TypeScript ABC (BrowserProvider, BrowserRegistry) matching hermes shape. ABC: name, display_name, is_available(), create_session(), close_session(), emergency_cleanup(), get_setup_schema(). Registry: _resolve() with explicit-config gate + legacy-preference walk. Land in packages/browser-provider/src/provider.ts and registry.ts. Native puppeteer controller becomes 'local' provider (always available, returns mock session metadata).
- **Value:** Unblocks cloud browser backends (Browserbase, Browser Use, Firecrawl cloud mode) without modifying browser-tools.ts; enables operator to pay for or self-host managed sessions on demand.
- **Verify:** Create 'local' provider for existing puppeteer controller, implement registry resolution with 3 test cases (explicit config, single eligible, legacy walk), verify emergency_cleanup doesn't raise on missing creds

### `WEB-3` Implement Firecrawl web search + extract provider  ★★★★ · L · missing

- **Reference:** /Users/jinan/ai/openclaw/extensions/firecrawl/src/firecrawl-search-provider.ts and firecrawl-fetch-provider.ts — implements WebSearchProvider with both search() and extract() capabilities; firecrawl-client.ts wraps the API with caching (SEARCH_CACHE, SCRAPE_CACHE) and SSRF guarding (allowHostnames, isPrivateIpAddress checks)
- **Muse approach:** Create @muse/firecrawl-provider package with FirecrawlWebSearchProvider class implementing WebSearchProvider ABC. Land in packages/firecrawl-provider/src/provider.ts. Implement: name='firecrawl', is_available() checks env FIRECRAWL_API_KEY, supports_search()=true, supports_extract()=true, search() and extract() methods calling the Firecrawl API with caching (Map<key, {value, expiresAt}>) and SSRF guards (reuse web-url-guard from domain-tools). Lazy-load the API client via dynamic import to defer deps until provider is selected.
- **Value:** Firecrawl is the highest-priority paid backend in hermes's legacy preference order; enables extraction from JS-heavy sites and crawl operations Muse can't do locally.
- **Verify:** Unit test with mocked Firecrawl API responses; integration test against a real key if available; verify caching logic (expiresAt honored, stale entries evicted), SSRF guard rejects localhost/10.0.0.0/8 URLs

### `WEB-4` Implement Brave Search provider (free tier, local-compatible)  ★★★★ · M · missing

- **Reference:** /Users/jinan/ai/openclaw/extensions/brave/src/brave-web-search-provider.ts — BRAVE_SEARCH_API_KEY, free API tier available, keyword search only (no extract)
- **Muse approach:** Create @muse/brave-provider package. BraveWebSearchProvider implementing WebSearchProvider ABC (search only, extract unimplemented). Land in packages/brave-provider/src/provider.ts. is_available() checks BRAVE_SEARCH_API_KEY; supports_search()=true, supports_extract()=false. search() method calls Brave API (lazy-loaded). Free tier makes this a strong fallback for operators who want to avoid DuckDuckGo's HTML scraping brittleness.
- **Value:** Brave provides a stable API alternative to DDG HTML scraping; free tier removes API key friction; fills gap between DDG (fragile) and paid tiers (Firecrawl/Exa/Tavily).
- **Verify:** Unit test with mocked Brave API; verify free tier key detection; test supports_extract()=false enforcement in registry routing

### `WEB-5` Implement SearXNG local provider with aggregate scoring  ★★★★ · S · partial

- **Reference:** /Users/jinan/ai/hermes-agent/plugins/web/searxng/provider.py — SEARXNG_URL config, search() only (no extract), result aggregation with score sorting; hermes preference order #5
- **Muse approach:** Refactor existing loopback-search.ts SearXNG path as a formal WebSearchProvider class (SearxngWebSearchProvider) in packages/web-provider/src/providers/searxng.ts. Extract the querySearxng() logic into provider's search() method. is_available() checks SEARXNG_URL env or config.yaml web.searxng_url. Add result sorting by score (like hermes does) so operator's SearXNG instance scoring is respected. Keep DDG fallback outside the registry (in main search resolution logic) as Muse's zero-config default.
- **Value:** Formalizes SearXNG as a first-class provider; enables operator to weight which SearXNG engines run via the existing searxngEngines parameter; improves result relevance when SearXNG is the primary backend.
- **Verify:** Verify score sorting (results ordered descending by score); test SearXNG URL resolution from both env var and config key; confirm DDG fallback still works when SearXNG unreachable

### `WEB-6` Add web extract capability to built-in muse.web server  ★★★★ · M · partial

- **Reference:** /Users/jinan/ai/hermes-agent/plugins/web/firecrawl/provider.py extract() method; openclaw's web-content-core/src/provider-runtime-shared.ts shows caching and format negotiation (markdown vs text)
- **Muse approach:** Extend loopback-web-read.ts (muse.web MCP server) with a second tool: web_extract (alongside existing read). Land in packages/domain-tools/src/loopback-web-read.ts. Add extract(urls: []) tool that fetches multiple URLs in parallel, returns [{url, title, content, metadata}] shape. Reuse existing extractReadableText() for text mode. Add optional 'format' param (markdown | text, default text for local-model compatibility). Cache extracted pages (in-memory Map<url, {content, expiresAt}>) with 1-hour TTL to avoid re-fetching on repeated reads.
- **Value:** Unifies search+extract workflow: muse.search returns URLs, muse.web.extract fetches them in one call; reduces latency vs sequential read calls; improves local model's ability to answer multi-source questions.
- **Verify:** Test extract([urls]) with mocked fetch; verify parallel fetching (not sequential); check cache hit/miss logic; confirm format param routes to markdown or text extraction

### `WEB-7` Implement provider capability matrix for tool routing  ★★★★ · S · missing

- **Reference:** /Users/jinan/ai/hermes-agent/agent/web_search_registry.py _resolve() logic applies capability filter: 'search' routes to providers with supports_search()=true; 'extract' routes to supports_extract()=true only
- **Muse approach:** Extend packages/web-provider/src/registry.ts with capability-aware resolution. Implement _resolve(configured, capability) that filters providers by the capability ('search' or 'extract') before applying fallback logic. When a model calls web_search, only providers with supports_search()=true are eligible. When it calls web_extract, only supports_extract()=true. Land routing logic in registry.ts resolve() function. This prevents routing a search-only provider (Brave, SearXNG) to an extract request.
- **Value:** Enables Muse to match search/extract requests to the right backend (e.g., Firecrawl for both, Brave for search-only); future-proofs when new providers with asymmetric capabilities are added; improves operator UX (config errors surfaced clearly, not silently downgraded).
- **Verify:** Test routing: web_search request with only extract-capable provider available → error or fallback to DuckDuckGo; web_extract request with only search-capable provider → error; test mixed providers (one search-only, one dual) → each routed correctly

### `WEB-8` Implement Exa web search provider (paid, dual-mode search+extract)  ★★★ · M · missing

- **Reference:** /Users/jinan/ai/hermes-agent/plugins/web/exa/provider.py — EXA_API_KEY auth, search() and extract() both supported; legacy preference order position #4 (after firecrawl, parallel, tavily)
- **Muse approach:** Create @muse/exa-provider package. ExaWebSearchProvider class implementing both search() and extract() by delegating to the Exa SDK (lazy-loaded). Land in packages/exa-provider/src/provider.ts. Support both 'search' and 'extract' capabilities; is_available() checks EXA_API_KEY env var. Result normalization to match hermes shape: {success, data/error}.
- **Value:** Exa is position #4 in hermes fallback order; provides neural/semantic search alternative to keyword-only backends; enables local model to benefit from ML-scored relevance without running embed model locally.
- **Verify:** Unit tests with mocked Exa API; verify both search() and extract() response shapes match expected {success, data}; test fallback when EXA_API_KEY unset

### `WEB-9` Implement Tavily web search provider (paid research API)  ★★★ · M · missing

- **Reference:** /Users/jinan/ai/hermes-agent/plugins/web/tavily/provider.py — TAVILY_API_KEY auth, search() and extract() both available; legacy preference #3
- **Muse approach:** Create @muse/tavily-provider package. TavilyWebSearchProvider implementing WebSearchProvider ABC. Land in packages/tavily-provider/src/provider.ts. is_available() checks TAVILY_API_KEY; supports_search()=true, supports_extract()=true. Implement search() and extract() methods calling the Tavily API (lazy-loaded httpx/fetch). Normalize responses to {success, data/error} shape.
- **Value:** Tavily is position #3 in hermes fallback order; provides source+metadata-rich extraction; blocks Muse's ability to compete on research-heavy tasks without setup.
- **Verify:** Mocked Tavily API responses; verify search() returns {success, data: {web: [...]}}; extract() returns {success, data: [{url, title, content, ...}]}

### `WEB-10` Add extract-mode caching with smart invalidation  ★★★ · M · partial

- **Reference:** /Users/jinan/ai/openclaw/extensions/firecrawl/src/firecrawl-client.ts lines 34-41 (SEARCH_CACHE, SCRAPE_CACHE with expiresAt logic)
- **Muse approach:** Extend packages/domain-tools/src/web-readable.ts or a new packages/domain-tools/src/web-cache.ts module. Implement WebCacheStore interface: get(url, mode): {content?, expiresAt?}; set(url, mode, content, ttlMs); invalidate(patterns). Land cache in domain-tools. Integrate into loopback-web-read.ts: before fetching, check cache; on success, store with default 24h TTL. Add web_cache_invalidate tool to the server (no-op if cache disabled). Respect Cache-Control headers (max-age, no-cache) when present.
- **Value:** Reduces redundant fetches and API calls when the model re-reads the same URL in a session; respects HTTP semantics (Cache-Control); improves response latency on knowledge-heavy tasks.
- **Verify:** Test cache hit (second read returns cached content within TTL); test expiry (read after TTL returns fresh content); test Cache-Control header override (no-cache forces fresh fetch)

### `WEB-11` Implement Browserbase cloud browser provider  ★★★ · L · missing

- **Reference:** /Users/jinan/ai/hermes-agent/plugins/browser/browserbase/provider.py — BrowserProvider subclass with is_available() checking BROWSERBASE_API_KEY, create_session() returns {session_name, bb_session_id, cdp_url, features}; legacy preference order #2
- **Muse approach:** Create packages/browserbase-provider/src/provider.ts with BrowserbaseProvider implementing BrowserProvider ABC. name='browserbase', is_available() checks BROWSERBASE_API_KEY env, create_session(task_id) calls Browserbase API to create a session and returns the CDP URL. Land session lifecycle (create/close/emergency_cleanup) in provider.ts. Lazy-load the HTTP client. The native browser-tools.ts connects to the returned CDP URL instead of the local puppeteer instance. Session pooling/cleanup is provider-managed (emergency_cleanup called on SIGTERM).
- **Value:** Enables operators to delegate browser control to a managed service (Browserbase); unblocks headless extraction from highly dynamic sites; reduces local resource usage for long-running agents.
- **Verify:** Mock Browserbase API create_session response; verify session_name and cdp_url are returned; test close_session() and emergency_cleanup() error handling (both must never raise)

### `WEB-12` Implement Browser Use cloud browser provider (with gateway support)  ★★★ · L · missing

- **Reference:** /Users/jinan/ai/hermes-agent/plugins/browser/browser_use/provider.py — dual auth (direct API key OR managed Nous gateway); idempotency tracking for retried creates; legacy preference order #1
- **Muse approach:** Create packages/browser-use-provider/src/provider.ts with BrowserUseProvider implementing BrowserProvider ABC. name='browser-use'. is_available() checks BROWSER_USE_API_KEY OR managed-gateway token. create_session() supports both direct API and gateway mode (config: tool_gateway.browser='gateway' prefers managed). Implement idempotency tracking (Map<task_id, idempotency_key>) for 409 retry detection. Land in packages/browser-use-provider/src. Emergency cleanup must handle both auth modes gracefully.
- **Value:** Browser Use is hermes's #1 fallback browser backend; managed-gateway mode enables billing through Nous subscription (reduces operator friction); direct API key path supports self-billed users.
- **Verify:** Test both auth paths (direct key and managed gateway); verify idempotency key reuse on 409 'already in progress'; test emergency_cleanup() with missing credentials

### `WEB-13` Implement browser session pooling and lifecycle management  ★★★ · M · missing

- **Reference:** /Users/jinan/ai/hermes-agent/agent/browser_provider.py create_session(task_id), close_session(session_id), emergency_cleanup(); pools sessions across tasks, closes stale/abandoned sessions
- **Muse approach:** Create packages/browser-session/src/session-pool.ts with BrowserSessionPool managing cloud browser provider sessions. Implement: create(task_id) → session_id; get(session_id) → provider + CDP URL; close(session_id); cleanup_stale(max_age_ms). Land in packages/browser-session/src. Hook into agent-core's task lifecycle: create session on task start, close on task end or timeout. SIGTERM handler calls emergency_cleanup(). For local provider (puppeteer), pooling is a no-op (one instance per agent process).
- **Value:** Prevents session leaks (abandoned cloud sessions drain credits); enables efficient resource usage (reuse sessions across related tasks); handles graceful shutdown (SIGTERM cleanup).
- **Verify:** Test session creation and close; verify stale sessions (> max_age) are evicted; test SIGTERM handler calls provider.emergency_cleanup() on all open sessions; mock cloud provider with session limits

### `WEB-14` Implement vision-grounded image content extraction in web reads  ★★ · S · partial

- **Reference:** /Users/jinan/ai/openclaw/extensions/browser/src/browser/vision.js describeBrowserScreenshot(); loopback-web-read.ts already has describeImage callback hook but it's unused
- **Muse approach:** Extend packages/domain-tools/src/loopback-web-read.ts to bind the describeImage callback (already present in WebReadMcpServerOptions) to web_read tool's IMG handling. When an <img> is encountered in a page and describeImage is bound, fetch the image and call describeImage({imageBase64, mimeType}) instead of just stripping the tag. Embed the vision description in the readable text output (e.g., '[Image: {description}]'). Land in packages/domain-tools/src/loopback-web-read.ts.
- **Value:** Local model can reason about charts, diagrams, infographics in web pages without leaving the local system; unblocks reading visual-heavy content (research papers with figures, dashboards, etc.).
- **Verify:** Test with a page containing <img> tags; mock describeImage callback; verify image is fetched, base64-encoded, and description is embedded in output text

### `WEB-15` Implement content deduplication and fragment-based extraction  ★★ · M · missing

- **Reference:** /Users/jinan/ai/openclaw/extensions/web-readability/src/readability.ts (uses Mozilla Readability library for smart content extraction, boilerplate removal)
- **Muse approach:** Create packages/web-content/src/fragment-extractor.ts. Implement URL#fragment-aware extraction: when a URL includes #section-name or #line-n, extract only that DOM subtree (not the whole page). Add deduplication logic: hash extracted content, skip re-extraction if hash matches recent cache entry. Land in packages/web-content/src. Integrate into loopback-web-read.ts extract() method: parse URL fragment, extract subtree if present, deduplicate on hash. This unblocks large-document workflows (TOC → jump to section → extract).
- **Value:** Enables fine-grained reading (jump to a specific section of a long article); reduces token load by extracting only relevant portions; improves local model's ability to navigate document-heavy tasks.
- **Verify:** Test URL#fragment extraction (e.g., example.com/article#section-2 extracts only that section); test hash-based deduplication (identical content hashes avoid re-fetch); compare extracted text length with/without fragment

### `WEB-16` Build pluggable search provider for external MCP servers  ★★ · M · missing

- **Reference:** hermes pattern: plugins/web/<name>/provider.py registers via PluginContext.register_web_search_provider(); openclaw: extensions/<name>/ with definePluginEntry and api.registerWebSearchProvider()
- **Muse approach:** Implement MCP-server-friendly provider registration: create packages/web-provider/src/external-provider-adapter.ts. Adapter wraps an external MCP tool (web_search, web_extract) as a WebSearchProvider instance without requiring code changes. Configuration-driven: config.yaml can list external MCPs that provide web_search or web_extract tools; they are auto-wrapped and added to the registry. Land in packages/web-provider/src/external-provider-adapter.ts. This lets operators plug in e.g. a custom Perplexity MCP server or a proprietary enterprise search API without forking Muse.
- **Value:** Extends search capability without code changes; allows operators to integrate proprietary/enterprise search backends; future-proofs Muse for new search APIs without release cycles.
- **Verify:** Create a mock external MCP tool provider (fake web_search MCP server); verify it can be registered and invoked via the adapter; test capability detection (search vs extract) from the MCP tool definition

### `WEB-17` Implement DuckDuckGo HTML provider as formal searchable backend  ★★ · S · partial

- **Reference:** /Users/jinan/ai/hermes-agent/plugins/web/ddgs/provider.py — search-only provider, legacy preference order #7 (fallback of fallbacks)
- **Muse approach:** Extract the existing DuckDuckGo HTML parsing logic (parseDuckDuckGoHtml from loopback-search.ts) into a formal DuckDuckGoWebSearchProvider class in packages/web-provider/src/providers/duckduckgo.ts. Implement WebSearchProvider ABC: name='duckduckgo-html', is_available()=true (no credentials), supports_search()=true, supports_extract()=false, search() method. Keep this as the final fallback in the registry (position #7 after all paid/self-hosted options). Land in packages/web-provider/src/providers/duckduckgo.ts.
- **Value:** Formalizes DDG as a guaranteed-available zero-config fallback; improves code clarity (explicit provider vs. inline fallback); enables operators to explicitly prefer/disable DDG via config.
- **Verify:** Verify parseDuckDuckGoHtml() still works on DDG HTML samples; test is_available()=true unconditionally; ensure DDG is position #7 in registry fallback order (after all paid providers)

### `WEB-18` Add health-check / 'doctor' command for search/browser providers  ★★ · M · partial

- **Reference:** /Users/jinan/ai/openclaw/extensions/browser/browser-doctor.ts detectLegacyClawdBrowserProfileResidue(), noteChromeMcpBrowserReadiness(); hermes: hermes doctor checks provider availability and credentials
- **Muse approach:** Create packages/web-provider/src/doctor.ts and packages/browser-provider/src/doctor.ts with health-check functions. Land in each provider package: export doctorSearchProviders() and doctorBrowserProviders() that test each provider's is_available() and perform a lightweight smoke test (e.g., a dummy API call with test credentials). Integrate into CLI: 'muse doctor' already exists; extend it to call these functions and report provider status. Output: list of available providers, active selection (what would be used), any configuration errors.
- **Value:** Operators can quickly diagnose search/browser provider setup issues; reduces support burden; improves onboarding clarity for new providers.
- **Verify:** Run 'muse doctor' with various env vars set/unset; verify available providers are listed; test error messages for misconfigured backends (wrong API key format, unreachable SearXNG URL, etc.)

## 12. CLI/TUI/UX · Onboarding · Diagnostics · Usage Surfaces

_19 items_


### `UX-1` Context-aware progressive onboarding hints (first-time tips)  ★★★★★ · S · missing

- **Reference:** hermes-agent/agent/onboarding.py: busy_input_hint_*(), tool_progress_hint_*(), is_seen(config, flag) — shown once per install at behavior fork points, tracked in config.yaml
- **Muse approach:** Create apps/cli/src/onboarding-hints.ts with pure hint-content functions (no agent deps, lightweight) + flag persistence in .muse/config.json. Hook into ask command to show hints at behavior forks (first long tool execution, first message while busy, first index build). Track seen flags per-install like Hermes does.
- **Value:** Users see contextual help exactly when they hit a feature (long-running tools, concurrent msgs, tool-progress cycling) without blocking first-run; reduces support friction.
- **Verify:** Unit tests for computeHint() pure logic; integration test that muse ask shows hint once then never again; e2e that /verbose cycles after tool-progress hint.

### `UX-2` Tool call preview + verb+detail formatting (skin-aware display)  ★★★★ · M · partial

- **Reference:** hermes-agent/agent/display.py: build_tool_preview(), get_tool_emoji(), skin-aware _diff_ansi() with hex color resolution from active skin
- **Muse approach:** Extend apps/cli/src/chat-ink.ts tool rendering to include build_tool_preview() for one-line summaries (tool name + primary arg truncated, e.g. 'read_file /path/to/...'). Store tool verb+detail in a shared config (json, not hardcoded), resolve skin colors at startup like Hermes does.
- **Value:** Tool calls render compactly and readably in CLI streaming output; user sees what tool is running before it completes, reducing confusion on long-running tasks.
- **Verify:** Test build_tool_preview() truncation at max_len boundaries; verify verb+detail render in chat-ink; e2e long tool call shows truncated preview on first line.

### `UX-3` Stream diagnostics + retry logging (per-attempt counters, upstream headers)  ★★★★ · M · missing

- **Reference:** hermes-agent/agent/stream_diag.py: stream_diag_init(), stream_diag_capture_response() capturing cf-ray, x-openrouter-provider, bytes/chunks/elapsed/ttfb, flatten_exception_chain() for multi-cause errors
- **Muse approach:** Create packages/observability/src/stream-diagnostics.ts with stream_diag_init() struct (started_at, chunks, bytes, headers dict) + capture_response() on stream open. Hook into model adapters' streaming to populate this; log structured WARNING with diag to observability sink when retry occurs. Include Ollama upstream headers (if available).
- **Value:** When Ollama or local model streaming fails mid-response, logs capture which attempt, how many bytes/chunks arrived, upstream headers for post-hoc analysis — enables users to diagnose edge-server or provider issues.
- **Verify:** Inject fault in model adapter streaming, verify diag struct is populated + logged; check log contains chunk count, elapsed time, headers; verify exception chain flattening on nested errors.

### `UX-4` Doctor command with --lint (read-only structured findings, JSON output)  ★★★★ · M · partial

- **Reference:** openclaw/docs/cli/doctor.md: three postures (inspect, repair --fix, lint --lint), --json output mode, --severity-min level filtering, --skip/--only check selection
- **Muse approach:** Extend apps/cli/src/commands-doctor.ts: add --lint mode (read-only) that emits structured findings {id, severity, message, remediation?} instead of interactive repairs. Add --json flag to output JSON array of findings. Implement --severity-min {info|warning|error} filter. Keep --fix interactive (status quo). Lint mode safe for CI/preflight gates.
- **Value:** CI pipelines, pre-upgrade checks, and status dashboards can query Muse health as machine-readable structured findings without triggering interactive prompts or repairs.
- **Verify:** Run muse doctor --lint --json, verify JSON array of {id, severity, message}; test --severity-min warning filters; test --skip/--only selection; verify CI doesn't prompt.

### `UX-5` Busy-input mode hints + /verbose cycling for tool progress  ★★★★ · S · missing

- **Reference:** hermes-agent/agent/onboarding.py: busy_input_hint_cli(mode), tool_progress_hint_cli() — once-shown, context-aware tips on first long tool and first message-while-busy
- **Muse approach:** Add to apps/cli/src/onboarding-hints.ts: busyInputHint(mode: 'interrupt'|'queue'|'steer') and toolProgressHint(). Hook into ask command: after first long-running tool (>3s) that streams, show tool_progress hint once + offer /verbose command. After first message received while busy, show busy_input hint once. Track in ~/.muse/config.json under hints.seen.
- **Value:** Users discover /verbose cycling (all → new → off) and /busy mode options organically at the moment they're needed, not via docs; reduces friction on first-time long tasks.
- **Verify:** Mock long-running tool, verify hint shows once; send msg while tool running, verify busy hint shows once; toggle /verbose, verify cycling works.

### `UX-6` Error type classification + actionable remediation (retry vs config-fix vs user-error)  ★★★★ · M · partial

- **Reference:** hermes stream_diag: flatten_exception_chain() distinguishing RemoteProtocolError vs ConnectError vs ReadError; OpenClaw doctor: remediation suggestions per finding type
- **Muse approach:** Create packages/observability/src/error-classification.ts with classifyError(error): {type: 'transient'|'config'|'user'|'unknown', retryable: bool, remediation?: string, errorChain: string}. Hook into ask command error handling to classify and suggest (e.g., 'Ollama offline — run: ollama serve', 'No notes found — run: muse ingest'). Store classification in observability for analytics.
- **Value:** When errors occur, users see the root cause + the exact next command to fix it, not generic 'something went wrong'; dramatically reduces support load.
- **Verify:** Inject Ollama offline error, verify classifyError returns retryable=false + 'ollama serve' remediation; inject permission error, verify user error classification.

### `UX-7` First-run config validation + remediation wizard (non-interactive guided tour)  ★★★★ · M · partial

- **Reference:** openclaw doctor --fix --non-interactive: safe migrations without prompts; hermes onboarding: profile_build_directive() instructing agent on first-message opt-in flow
- **Muse approach:** Extend apps/cli/src/commands-onboard.ts to add --auto-fix mode (non-interactive, safe migrations only): detect and repair common issues (missing .muse/config.json, wrong MUSE_NOTES_DIR, missing Ollama connection). Log changes to muse.log. Pair with contextual hints so user learns what happened. Never touch unsafe settings without --force.
- **Value:** Users who run muse onboard --auto-fix get a working setup in one command; first-run is <30s instead of debugging Ollama/paths manually.
- **Verify:** Delete .muse/config.json, run muse onboard --auto-fix, verify config is created and populated; check log records migration; run again, verify no duplicate migration.

### `UX-8` Decimal money parsing + formatting (fail-safe, exact precision)  ★★★ · S · missing

- **Reference:** hermes-agent/agent/billing_view.py: parse_money(value) → Decimal (never raises), format_money() whole/fractional rules, CardInfo.masked property
- **Muse approach:** Create apps/cli/src/money-formatting.ts (or packages/observability if billing surfaces go there later) with parse_money(value): Decimal | undefined (defensive, no throw) and format_money(value): string following Hermes' rules: whole dollars no decimals, fractions always 2dp. Export for CLI /cost display, future web billing UI.
- **Value:** Cost displays in CLI (muse cost command) render correctly with no rounding errors or NaN leakage; local-model runs have $0 cost but the machinery is ready for future cloud integrations.
- **Verify:** Unit tests: parse_money('142.5'), parse_money('100'), parse_money(null); format_money tests verify 2dp on fractions, whole dollars no decimals.

### `UX-9` Usage + cost dashboard (web UI with daily aggregation, time-range filters)  ★★★ · M · partial

- **Reference:** openclaw/ui/src/ui/app-render-usage-tab.ts: renderUsageTab(), mergeUsageCacheStatus(), usage filters (startDate, endDate, scope, agentId, query), cost-daily bar chart aggregation
- **Muse approach:** Enhance apps/web/src/views/Dashboard.tsx to add a 'Usage' tab with date-range picker, per-model token aggregation, daily cost bars (even if $0 for local), cache-status indicator (fresh/partial/stale/refreshing). Leverage existing observability token-cost queries. Hide cost columns when MUSE_LOCAL_ONLY=true.
- **Value:** Users see their token usage over time (7d rolling default) with visual per-day breakdown; ready for future billing integration; proves observability data is queryable.
- **Verify:** Render Dashboard with 7d token-cost rows; verify date range picker changes aggregation; check cache-status badge updates; ensure cost=0 columns render cleanly on local-only.

### `UX-10` Tool output diff rendering with skin-aware colors  ★★★ · M · partial

- **Reference:** hermes-agent/agent/display.py: _diff_ansi() resolving skin colors from hex config, _MAX_INLINE_DIFF_FILES/LINES limits, file/hunk/minus/plus color codes
- **Muse approach:** Create apps/cli/src/diff-renderer.ts with renderDiff(before: string, after: string, maxFiles=6, maxLines=80) using ansi-escapes. Resolve colors at startup from (theme, fallback to dark-theme defaults). Add to chat-ink tool-output rendering when diff is detected in output. Respect Muse's theme config.
- **Value:** When tools produce file diffs (read_file comparison, before-after snapshots), CLI renders them compactly with syntax color, bounded by line count to avoid spam.
- **Verify:** Unit test: renderDiff() with 10 file changes, verify only first 6 rendered; test line limit; verify ANSI color codes in output; e2e tool shows colored diff.

### `UX-11` Tool execution profiler + timing ladder (started_at, completed_at per tool, p50/p95 latency)  ★★★ · M · partial

- **Reference:** hermes-agent/agent/stream_diag.py: per-attempt started_at/first_chunk_at/elapsed time tracking; openclaw usage-tab: latency summary p50Ms, p95Ms
- **Muse approach:** Extend packages/observability/src/observability-latency.ts to record tool_started, tool_completed per tool call (not just model latency). Add compute_tool_latencies() returning {toolName: string, p50Ms, p95Ms, samples}. Export CLI /cost command variant /perf to show tool-latency ladder (sorted DESC by p95). Store in observability sink.
- **Value:** Users see which tools are slow (read_file on large files, web_search network latency, etc.) and where to optimize; identifies tools that need caching or parallelization.
- **Verify:** Record 10 runs of a slow tool, compute p50/p95, verify /perf ladder is sorted, verify slowest tool is first.

### `UX-12` Cache health probes + refresh status indicator (fresh/partial/stale/refreshing)  ★★★ · M · partial

- **Reference:** openclaw/ui/src/ui/app-render-usage-tab.ts: cacheStatus {status, cachedFiles, pendingFiles, staleFiles, refreshedAt}, mergeUsageCacheStatus() for multi-source
- **Muse approach:** Create packages/observability/src/cache-health.ts with CacheStatus {status: 'fresh'|'partial'|'stale'|'refreshing', cachedFiles, pendingFiles, staleFiles, refreshedAt?}. Implement registerCacheHealthProbe() pattern so notes-index, memory-store, tool-registry can report probe results. Dashboard usage-tab and status --watch show cache refresh status badge.
- **Value:** Users see at-a-glance whether their notes index is up-to-date, memory store is being synced, tool registry refreshed; prevents confusion on 'why is my index out of date'.
- **Verify:** Register two probe providers (notes, memory); force stale on one, check status shows 'partial'; trigger refresh, check status becomes 'fresh'.

### `UX-13` Session activity log + run summary (tools executed, tokens used, time elapsed, success/failure)  ★★★ · M · partial

- **Reference:** openclaw/ui/src/ui/activity-model.ts: ActivityEntry tracking tool calls, tool results; hermes stream_diag: attempt logging with kind (stream success/failure)
- **Muse approach:** Extend observability to emit session-level activity summaries after each turn: {turnId, startedAt, endedAt, elapsedMs, toolsExecuted: [{name, status, elapsedMs, costUsd}], totalTokens, totalCostUsd, finalStatus: 'ok'|'error'|'partial'}. Display in muse cost command as turn-by-turn breakdown, and in web dashboard activity feed.
- **Value:** Users understand what happened in each turn (which tools ran, how long, cost, success/fail), aiding debugging and learning system behavior; provides foundation for future analytics.
- **Verify:** Run ask with 3 tool calls, verify session summary records all 3, totals are correct, status matches final outcome.

### `UX-14` Streaming progress indicator + ETA for long-running tasks (chunks/bytes/elapsed, expected total)  ★★★ · M · partial

- **Reference:** hermes display.py: _tool_progress track chunks/bytes/elapsed; openclaw tool-stream: throttle at 80ms, limit to 50 updates per run to avoid spam
- **Muse approach:** Enhance apps/cli/src/chat-ink.ts tool-output rendering to track stream progress: on each chunk, update a progress line (10% completion bars or 'chunk 42/120' text, elapsed time). Throttle updates to 80ms like Hermes. For long operations, show estimated time-to-completion (if we have a file size or token budget). Hide when --quiet or /verbose=off.
- **Value:** Long-running tools (web_search, read_large_file, image_generate) show live progress so user doesn't think it's hung; reduces impatience and accidental interrupts.
- **Verify:** Mock 30-second tool with chunk callbacks, verify progress bar renders every 80ms, verify ETA shown, verify not spammed (max 50 updates).

### `UX-15` Billing state parser + fail-open structure (login/balance/monthly-cap/auto-reload)  ★★ · S · missing

- **Reference:** hermes-agent/agent/billing_view.py: BillingState dataclass, billing_state_from_payload(), role-based permissions (is_admin, can_charge), fail-open on 401/unreachable
- **Muse approach:** Create packages/observability/src/billing-state.ts with BillingState dataclass (logged_in, balance_usd: Decimal, monthly_cap, auto_reload, card, error on fetch failure). Implement billing_state_from_payload() parser. Return logged_in=false + empty fields gracefully when endpoint unreachable, never crash. Designed for future /api/billing/state endpoint.
- **Value:** When Muse adds optional cloud tier in future, billing UI has proven, fail-open architecture identical to Hermes; users never see crashes on billing fetch failure.
- **Verify:** Unit tests: parse valid payload, parse missing org, parse with card/cap/reload; verify logged_in=false when fetch fails; check can_charge permissions.

### `UX-16` Model fallback attempt tracking + display (provider/model/error per attempt)  ★★ · M · partial

- **Reference:** openclaw/ui/src/ui/app-tool-stream.ts: FallbackAttempt {provider, model, ...}, tool-stream activity log showing fallback chain
- **Muse approach:** Enhance packages/model adapters to emit 'attempt' events {runId, seq, provider, model, startedAt, errorType, retryable} on fallback. Store in observability sink. CLI status output can show fallback ladder when --watch flag is used (or /perf command). Web dashboard can show attempt chain in run details.
- **Value:** When Muse has multiple local models or future cloud fallbacks, users see the full attempt chain (which model failed with what error, which one succeeded), aiding debugging and model selection.
- **Verify:** Mock model adapter to return retryable error on first call, success on second; verify attempt events emitted; check status --watch shows fallback chain.

### `UX-17` Token usage breakdown by model + step type (prompt vs completion vs cached)  ★★ · M · partial

- **Reference:** openclaw usage-tab: daily cost aggregation by model; hermes billing_view: parse decimal balances; muse observability already has TokenUsageRecord with prompt/completion/cached counts
- **Muse approach:** Enhance apps/cli/src/commands-ask.ts or create /cost command variant to query observability TokenCostQuery and display: this-session tokens broken down by (model, step_type: 'system'|'act'|'tool'|'extract'), with subtotals for prompt-vs-completion, cache-hit benefit (cached_tokens × 10% cost ratio for future OpenAI Anthropic).  Web dashboard Usage tab shows same breakdown.
- **Value:** Users see where tokens are spent (which model, which phase of reasoning) and understand cache hit benefit; informs model/strategy choices.
- **Verify:** Query token-cost by step_type, verify act/extract/tool totals are correct; check cached_tokens are tracked; render in /cost CLI output.

### `UX-18` Observability event type registry + filtering (emit events by category, dashboard subscribe to subsets)  ★★ · M · partial

- **Reference:** hermes stream_events.py: categorized stream events (start, chunk, error, retry); openclaw activity-model: updateActivityFromToolEvent filtering by event stream type
- **Muse approach:** Extend packages/observability/src/index.ts to emit typed events: {eventType: 'tool_started'|'tool_chunk'|'tool_completed'|'model_attempt'|'error_classify'|'hint_shown', ...payload}. CLI and web UI can subscribe to subsets (e.g., web only listens to completed events, CLI listens to everything). Implement in-memory EventBus pattern for local routing.
- **Value:** Future observability consumers (analytics, dashboards, external integrations) have a clean pub/sub model instead of querying stored data; enables real-time streaming dashboards.
- **Verify:** Emit 3 event types in sequence, verify CLI listener receives all, verify dashboard listener filters to completed only.

### `UX-19` Latency SLO tracking + alerting (p95 baseline, deviation detection)  ★★ · M · partial

- **Reference:** openclaw usage-tab latency summary; muse observability already has observability-slo-alert.ts
- **Muse approach:** Complete observability-slo-alert.ts: define SLO {metric: 'p95_latency_ms', baseline: 2000, window: '7d', deviation_threshold: 1.5}. Track deviations and emit alert events when p95 > baseline × threshold for 3+ runs in a row. Store SLO violations in observability sink. CLI /perf can show 'latency degraded 50% vs baseline'.
- **Value:** Users detect when system performance has regressed (model slower, local hardware change, Ollama setup change) and get alerted before noticing manually.
- **Verify:** Set baseline to 100ms, simulate 10 runs averaging 160ms, verify alert fires on 3rd run above threshold.

---

## Totals

- Items: **221** (deduped from 221 raw; 0 intra-domain duplicates removed)
- Gap: missing **125** · partial **96**
- Effort: S **54** · M **135** · L **32**
- Tiers: ★★★★★ **21** · ★★★★ **45** · ★★★ **63** · ★★ **65** · ★ **27**
