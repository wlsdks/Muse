import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000
    }
  }
});

interface HealthResponse {
  readonly service?: string;
  readonly status?: string;
}

interface ChatResponse {
  readonly content?: string;
  readonly response?: string;
  readonly runId?: string;
  readonly metadata?: Record<string, unknown>;
}

interface ApprovalSummary {
  readonly id: string;
  readonly runId: string;
  readonly toolName: string;
  readonly userId: string;
  readonly status: string;
}

interface SessionSummary {
  readonly id?: string;
  readonly status?: string;
  readonly model?: string;
  readonly provider?: string;
  readonly inputPreview?: string;
}

interface AdminSummary {
  readonly pendingApprovals?: number;
  readonly recentRuns?: readonly SessionSummary[];
}

interface ToolCatalogEntry {
  readonly name: string;
  readonly description: string;
  readonly risk: "read" | "write" | "execute";
  readonly keywords?: readonly string[];
  readonly scopes?: readonly string[];
}

interface ToolCatalogResponse {
  readonly tools: readonly ToolCatalogEntry[];
  readonly total: number;
}

interface OrchestrationEntry {
  readonly runId: string;
  readonly mode: "sequential" | "parallel";
  readonly status: "completed" | "failed";
  readonly workerCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly conversationLength?: number;
}

interface OrchestrationListResponse {
  readonly entries: readonly OrchestrationEntry[];
  readonly total: number;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MuseConsole />
    </QueryClientProvider>
  );
}

export function MuseConsole() {
  const [apiUrl, setApiUrl] = useState(() => readLocalSetting("muse.apiUrl", "http://127.0.0.1:3000"));
  const [token, setToken] = useState(() => readLocalSetting("muse.token", ""));
  const client = useMemo(() => createApiClient(apiUrl, token), [apiUrl, token]);
  const health = useQuery({
    queryFn: () => client.get<HealthResponse>("/health"),
    queryKey: ["health", apiUrl]
  });
  const admin = useQuery({
    queryFn: () => client.get<AdminSummary>("/admin/summary"),
    queryKey: ["admin-summary", apiUrl, token]
  });
  const approvals = useQuery({
    queryFn: () => client.get<readonly ApprovalSummary[]>("/api/approvals/pending"),
    queryKey: ["approvals", apiUrl, token]
  });
  const tools = useQuery({
    queryFn: () => client.get<ToolCatalogResponse>("/api/tools"),
    queryKey: ["tools", apiUrl, token]
  });
  const orchestrations = useQuery({
    queryFn: () => client.get<OrchestrationListResponse>("/api/multi-agent/orchestrations?limit=10"),
    queryKey: ["orchestrations", apiUrl, token]
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <section>
          <p className="eyebrow">Agent Platform</p>
          <h1>Muse</h1>
        </section>
        <ConnectionSettings apiUrl={apiUrl} token={token} onApiUrl={setApiUrl} onToken={setToken} />
      </header>

      <section className="status-strip" aria-label="Runtime status">
        <StatusMetric label="API" value={health.data?.status ?? statusLabel(health.status)} />
        <StatusMetric label="Service" value={health.data?.service ?? "muse-api"} />
        <StatusMetric label="Approvals" value={String(admin.data?.pendingApprovals ?? approvals.data?.length ?? 0)} />
        <StatusMetric label="Tools" value={String(tools.data?.total ?? 0)} />
        <StatusMetric label="Orchestrations" value={String(orchestrations.data?.total ?? 0)} />
      </section>

      <section className="workspace">
        <ChatPanel client={client} />
        <aside className="side-panel">
          <ApprovalsPanel approvals={approvals.data ?? []} loading={approvals.isLoading} />
          <RunsPanel runs={admin.data?.recentRuns ?? []} loading={admin.isLoading} />
          <ToolCatalogPanel tools={tools.data?.tools ?? []} loading={tools.isLoading} />
          <OrchestrationsPanel
            entries={orchestrations.data?.entries ?? []}
            loading={orchestrations.isLoading}
          />
        </aside>
      </section>
    </main>
  );
}

function ConnectionSettings(props: {
  readonly apiUrl: string;
  readonly token: string;
  readonly onApiUrl: (value: string) => void;
  readonly onToken: (value: string) => void;
}) {
  return (
    <form className="connection-form">
      <label>
        <span>API URL</span>
        <input
          value={props.apiUrl}
          onChange={(event) => {
            writeLocalSetting("muse.apiUrl", event.target.value);
            props.onApiUrl(event.target.value);
          }}
        />
      </label>
      <label>
        <span>Token</span>
        <input
          type="password"
          value={props.token}
          onChange={(event) => {
            writeLocalSetting("muse.token", event.target.value);
            props.onToken(event.target.value);
          }}
        />
      </label>
    </form>
  );
}

function ChatPanel({ client }: { readonly client: ApiClient }) {
  const [message, setMessage] = useState("");
  const [latest, setLatest] = useState<ChatResponse | undefined>();
  const chat = useMutation({
    mutationFn: (nextMessage: string) => client.post<ChatResponse>("/api/chat", { message: nextMessage })
  });

  return (
    <section className="tool-surface" aria-label="Ask Muse">
      <div className="surface-heading">
        <h2>Ask Muse</h2>
        <span>{chat.isPending ? "Running" : "Ready"}</span>
      </div>
      <form
        className="chat-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmed = message.trim();

          if (!trimmed) {
            return;
          }

          const response = await chat.mutateAsync(trimmed);
          setLatest(response);
        }}
      >
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Compare two product directions, clarify tradeoffs, or choose a next step."
        />
        <button type="submit" disabled={chat.isPending || message.trim().length === 0}>
          Run
        </button>
      </form>
      <output className="chat-output">
        {chat.error
          ? `Error: ${chat.error instanceof Error ? chat.error.message : "request failed"}`
          : latest?.response ?? latest?.content ?? ""}
      </output>
    </section>
  );
}

function ApprovalsPanel(props: { readonly approvals: readonly ApprovalSummary[]; readonly loading: boolean }) {
  return (
    <section className="tool-surface compact" aria-label="Approvals">
      <div className="surface-heading">
        <h2>Approvals</h2>
        <span>{props.loading ? "Loading" : props.approvals.length}</span>
      </div>
      <ul className="record-list">
        {props.approvals.map((approval) => (
          <li key={approval.id}>
            <strong>{approval.toolName}</strong>
            <span>{approval.userId}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunsPanel(props: { readonly runs: readonly SessionSummary[]; readonly loading: boolean }) {
  return (
    <section className="tool-surface compact" aria-label="Recent runs">
      <div className="surface-heading">
        <h2>Recent Runs</h2>
        <span>{props.loading ? "Loading" : props.runs.length}</span>
      </div>
      <ul className="record-list">
        {props.runs.map((run, index) => (
          <li key={run.id ?? `run-${index}`}>
            <strong>{run.status ?? "unknown"}</strong>
            <span>{run.model ?? run.provider ?? run.inputPreview ?? "run"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ToolCatalogPanel(props: { readonly tools: readonly ToolCatalogEntry[]; readonly loading: boolean }) {
  const grouped = useMemo(() => {
    const buckets: Record<"read" | "write" | "execute", number> = { execute: 0, read: 0, write: 0 };
    for (const tool of props.tools) {
      buckets[tool.risk] += 1;
    }
    return buckets;
  }, [props.tools]);

  return (
    <section className="tool-surface compact" aria-label="Tool catalog">
      <div className="surface-heading">
        <h2>Tools</h2>
        <span>{props.loading ? "Loading" : props.tools.length}</span>
      </div>
      <div className="metric-row">
        <RiskPill label="read" value={grouped.read} />
        <RiskPill label="write" value={grouped.write} />
        <RiskPill label="execute" value={grouped.execute} />
      </div>
      <ul className="record-list">
        {props.tools.slice(0, 8).map((tool) => (
          <li key={tool.name}>
            <strong>{tool.name}</strong>
            <span className={`risk-${tool.risk}`}>{tool.risk}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrchestrationsPanel(props: { readonly entries: readonly OrchestrationEntry[]; readonly loading: boolean }) {
  return (
    <section className="tool-surface compact" aria-label="Orchestration history">
      <div className="surface-heading">
        <h2>Orchestrations</h2>
        <span>{props.loading ? "Loading" : props.entries.length}</span>
      </div>
      <ul className="record-list">
        {props.entries.map((entry) => (
          <li key={entry.runId}>
            <strong>
              {entry.mode} · {entry.completedCount}/{entry.workerCount}
            </strong>
            <span className={`status-${entry.status}`}>
              {entry.status} · {Math.round(entry.durationMs)}ms
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RiskPill({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <span className={`risk-pill risk-${label}`}>
      <em>{label}</em>
      <strong>{value}</strong>
    </span>
  );
}

function StatusMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function createApiClient(baseUrl: string, token: string): ApiClient {
  return {
    get: (path) => request(baseUrl, token, path),
    post: (path, body) => request(baseUrl, token, path, body)
  };
}

interface ApiClient {
  readonly get: <T>(path: string) => Promise<T>;
  readonly post: <T>(path: string, body: Record<string, unknown>) => Promise<T>;
}

async function request<T>(baseUrl: string, token: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(new URL(path, baseUrl).toString(), {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    method: body ? "POST" : "GET"
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function statusLabel(status: string): string {
  return status === "pending" ? "checking" : status;
}

function readLocalSetting(key: string, fallback: string): string {
  return typeof localStorage === "undefined" ? fallback : localStorage.getItem(key) ?? fallback;
}

function writeLocalSetting(key: string, value: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
  }
}
