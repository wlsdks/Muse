import { useQuery } from "@tanstack/react-query";

import type { ApiClient } from "./App.js";

type ActivityKind = "reminder" | "proactive" | "followup" | "pattern" | "episode";

interface ActivityEntry {
  readonly kind: ActivityKind;
  readonly whenIso: string;
  readonly summary: string;
  readonly status?: string;
  readonly providerId?: string;
  readonly destination?: string;
  readonly id?: string;
}

interface HistoryResponse {
  readonly entries: readonly ActivityEntry[];
  readonly total: number;
}

export function relativeFromNow(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return iso;
  }
  const diff = nowMs - t;
  const abs = Math.abs(diff);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (abs < MIN) {
    return "just now";
  }
  const pick = (n: number, unit: string): string => (diff >= 0 ? `${n}${unit} ago` : `in ${n}${unit}`);
  if (abs < HOUR) {
    return pick(Math.round(abs / MIN), "m");
  }
  if (abs < DAY) {
    return pick(Math.round(abs / HOUR), "h");
  }
  if (abs < 7 * DAY) {
    return pick(Math.round(abs / DAY), "d");
  }
  return new Date(t).toLocaleDateString();
}

export function HistoryPanel({ client }: { readonly client: ApiClient }) {
  const history = useQuery({
    queryFn: () => client.get<HistoryResponse>("/api/history?limit=20"),
    queryKey: ["history"]
  });

  return (
    <section className="tool-surface compact" aria-label="Activity history">
      <div className="surface-heading">
        <h2>Activity</h2>
        <span>{history.isLoading ? "Loading" : (history.data?.total ?? 0)}</span>
      </div>
      <ul className="record-list">
        {(history.data?.entries ?? []).slice(0, 12).map((entry, index) => (
          <li key={entry.id ?? `${entry.kind}:${entry.whenIso}:${index.toString()}`}>
            <strong>{entry.summary}</strong>
            <span className="risk-read">
              {entry.kind} · {relativeFromNow(entry.whenIso)}
              {entry.status ? ` · ${entry.status}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
