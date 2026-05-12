import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { ApiClient } from "./api-client.js";
import type {
  CalendarCredentialsResponse,
  CalendarProvidersResponse
} from "./app-types.js";

export function CalendarSettingsPanel({ client }: { readonly client: ApiClient }) {
  const providers = useQuery({
    queryFn: () => client.get<CalendarProvidersResponse>("/api/calendar/providers"),
    queryKey: ["calendar-providers"]
  });
  const credentials = useQuery({
    queryFn: () => client.get<CalendarCredentialsResponse>("/api/calendar/credentials").catch(() => ({ providers: [] as readonly string[] })),
    queryKey: ["calendar-credentials"]
  });
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ readonly tone: "ok" | "error"; readonly message: string } | null>(null);

  const saveCredentials = useMutation({
    mutationFn: async ({ id, body }: { readonly id: string; readonly body: Record<string, string> }) =>
      client.put<unknown>(`/api/calendar/credentials/${encodeURIComponent(id)}`, body),
    onError: (error) => {
      setFeedback({ message: error instanceof Error ? error.message : "Failed to save credentials", tone: "error" });
    },
    onSuccess: async () => {
      setFeedback({ message: "Saved. Restart muse-api for changes to take effect.", tone: "ok" });
      setActiveProvider(null);
      setDraft({});
      await Promise.all([providers.refetch(), credentials.refetch()]);
    }
  });

  const removeCredentials = useMutation({
    mutationFn: async (id: string) => client.delete<unknown>(`/api/calendar/credentials/${encodeURIComponent(id)}`),
    onError: (error) => {
      setFeedback({ message: error instanceof Error ? error.message : "Failed to remove credentials", tone: "error" });
    },
    onSuccess: async () => {
      setFeedback({ message: "Removed. Restart muse-api to drop the provider.", tone: "ok" });
      await Promise.all([providers.refetch(), credentials.refetch()]);
    }
  });

  const stored = useMemo(() => new Set(credentials.data?.providers ?? []), [credentials.data]);

  return (
    <section className="tool-surface compact" aria-label="Calendar settings">
      <div className="surface-heading">
        <h2>Calendar</h2>
        <span>{providers.isLoading ? "Loading" : (providers.data?.providers.length ?? 0)}</span>
      </div>
      {feedback ? (
        <p className={`status-${feedback.tone === "ok" ? "ok" : "error"}`}>{feedback.message}</p>
      ) : null}
      <ul className="record-list">
        {(providers.data?.providers ?? []).map((provider) => (
          <li key={provider.id}>
            <strong>{provider.displayName}</strong>
            <span className={provider.local ? "risk-read" : "risk-write"}>
              {provider.local ? "local" : stored.has(provider.id) ? "configured" : "needs setup"}
            </span>
            {!provider.local ? (
              <div className="connection-form" style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
                {activeProvider === provider.id ? (
                  <>
                    {provider.credentials.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <input
                          type={field.secret ? "password" : "text"}
                          placeholder={field.description}
                          value={draft[field.key] ?? ""}
                          onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                        />
                      </label>
                    ))}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setFeedback(null);
                          saveCredentials.mutate({ body: draft, id: provider.id });
                        }}
                        disabled={saveCredentials.isPending}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProvider(null);
                          setDraft({});
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveProvider(provider.id);
                        setDraft({});
                        setFeedback(null);
                      }}
                    >
                      {stored.has(provider.id) ? "Reconfigure" : "Connect"}
                    </button>
                    {stored.has(provider.id) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFeedback(null);
                          removeCredentials.mutate(provider.id);
                        }}
                        disabled={removeCredentials.isPending}
                      >
                        Disconnect
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
