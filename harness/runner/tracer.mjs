// Observability — the trace component. The 2026 harness consensus names
// observability as a core layer: it turns "my agent did something weird" into a
// reproducible, auditable record (Boris Cherny; control-plane "auditable
// records"; Anthropic "reproducible trace + cost"). This records every step
// under one correlation id, summarizes cost/steps/outcome, and redacts secrets.
//
// Harness infrastructure (it records as the loop runs), not domain work. Zero deps.

export function createTracer(opts = {}) {
  const { runId = 'run', now = () => 0, redact = (d) => d } = opts;
  const events = [];
  let seq = 0;
  return {
    runId,
    get events() { return events; },

    // Record one structured event. `data.cost` (if a number) feeds the cost roll-up.
    add(event, data = {}) {
      const rec = { seq: seq++, t: now(), runId, event, ...redact({ ...data }) };
      events.push(rec);
      return rec;
    },

    // Roll-up for dashboards/regression: counts by event, blocked count, total
    // duration, summed cost.
    summary() {
      const byEvent = {};
      let cost = 0;
      for (const e of events) {
        byEvent[e.event] = (byEvent[e.event] || 0) + 1;
        if (typeof e.cost === 'number') cost += e.cost;
      }
      const ts = events.map((e) => e.t).filter((t) => typeof t === 'number');
      return {
        runId,
        total: events.length,
        byEvent,
        blocked: byEvent.blocked || 0,
        durationMs: ts.length ? ts[ts.length - 1] - ts[0] : 0,
        cost,
      };
    },

    toJSON() { return { runId, events, summary: this.summary() }; },
  };
}

// A ready-made redactor: drop/replace common secret-bearing keys so traces are
// safe to persist. Shallow by design (predictable, deterministic).
const SECRET_KEYS = /^(api[_-]?key|authorization|token|secret|password|cookie)$/i;
export function redactSecrets(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = SECRET_KEYS.test(k) ? '[redacted]' : v;
  return out;
}
