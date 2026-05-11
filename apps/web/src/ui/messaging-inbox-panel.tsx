/**
 * MessagingInboxPanel — provider-pick / channel-source picker + inbox
 * list + send form + pull-now / pull-all controls.
 *
 * Extracted from personal-panels.tsx (Loop #74) — same per-panel
 * pattern as SetupPanel (Loop #70), RemindersPanel (Loop #71),
 * ActiveContextPanel (Loop #73). The supporting message-shape
 * types (`MessagingProviderInfo`, `MessagingInboundRow`, response
 * envelopes) move with the panel since nothing else in the barrel
 * references them.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { ApiClient } from "./App.js";

interface MessagingProviderInfo {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly local?: boolean;
}

interface MessagingProvidersResponse {
  readonly providers: readonly MessagingProviderInfo[];
}

interface MessagingInboundRow {
  readonly providerId: string;
  readonly messageId: string;
  readonly source: string;
  readonly sender?: string;
  readonly receivedAtIso: string;
  readonly text: string;
}

interface MessagingInboxResponse {
  readonly providerId: string;
  readonly inbound: readonly MessagingInboundRow[];
  readonly total: number;
}

export function MessagingInboxPanel({ client }: { readonly client: ApiClient }) {
  const providers = useQuery({
    queryFn: () => client.get<MessagingProvidersResponse>("/api/messaging/providers"),
    queryKey: ["messaging-providers"],
    retry: false
  });
  const list = providers.data?.providers ?? [];
  const [providerId, setProviderId] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const effective = providerId.length > 0 ? providerId : list[0]?.id ?? "";

  // Slack still requires `source` (snapshot via conversations.history).
  // Discord's read path now goes through the daemon-fed inbox file
  // (Phase 2.c.4), so `source` is optional — blank = all channels.
  const requiresSource = effective === "slack";
  const supportsSource = effective === "discord" || effective === "slack";

  const inbox = useQuery({
    enabled: effective.length > 0 && (!requiresSource || source.length > 0),
    queryFn: () => {
      const params = new URLSearchParams({ providerId: effective, limit: "20" });
      if (supportsSource && source.length > 0) {
        params.set("source", source);
      }
      return client.get<MessagingInboxResponse>(`/api/messaging/inbox?${params.toString()}`);
    },
    queryKey: ["messaging-inbox", effective, source],
    retry: false
  });

  // Outbound send form. Keep destination + text local so a misdirected
  // message doesn't survive a provider switch.
  const [destination, setDestination] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [sendError, setSendError] = useState<string | null>(null);
  const sendMessage = useMutation({
    mutationFn: async (payload: { destination: string; text: string }) =>
      client.post<{ readonly messageId?: string }>("/api/messaging/send", {
        destination: payload.destination,
        providerId: effective,
        text: payload.text
      }),
    onError: (err) => setSendError(err instanceof Error ? err.message : "Failed to send"),
    onSuccess: async () => {
      setDraft("");
      setSendError(null);
      await inbox.refetch();
    }
  });

  // Agent-triggered off-cadence poll (Loop #46) — same dispatcher
  // backs muse.messaging.poll_now. LINE is webhook-fed so the button
  // is hidden for it; everyone else can pull on demand.
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const pollNow = useMutation({
    mutationFn: async () =>
      client.post<{ readonly ingested?: number }>("/api/messaging/poll", {
        providerId: effective,
        ...(supportsSource && source.length > 0 ? { source } : {})
      }),
    onError: (err) => setPollStatus(err instanceof Error ? err.message : "Pull failed"),
    onSuccess: async (result) => {
      setPollStatus(`Pulled ${result.ingested ?? 0} message(s)`);
      await inbox.refetch();
    }
  });
  const supportsPullNow = effective === "telegram" || effective === "discord" || effective === "slack";

  // Pull-all spans every wired provider in one call. Visible on
  // any panel state where the panel has providers — it isn't
  // provider-specific, so source/effective don't gate it.
  const [pollAllStatus, setPollAllStatus] = useState<string | null>(null);
  const pollAll = useMutation({
    mutationFn: async () =>
      client.post<{
        readonly ingestedByProvider?: Readonly<Record<string, number>>;
        readonly errors?: readonly { readonly providerId: string; readonly message: string }[];
      }>("/api/messaging/poll-all", {}),
    onError: (err) => setPollAllStatus(err instanceof Error ? err.message : "Pull-all failed"),
    onSuccess: async (result) => {
      const counts = result.ingestedByProvider ?? {};
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      const breakdown = Object.entries(counts).map(([id, n]) => `${id}:${n.toString()}`).join(" ");
      const errs = result.errors ?? [];
      setPollAllStatus(
        `Pulled ${total.toString()} total${breakdown ? ` (${breakdown})` : ""}` +
        (errs.length > 0 ? ` · ${errs.length.toString()} error(s)` : "")
      );
      await inbox.refetch();
    }
  });

  return (
    <section className="tool-surface compact" aria-label="Messaging">
      <div className="surface-heading">
        <h2>Messaging</h2>
        <span>{inbox.isLoading ? "Loading" : (inbox.data?.total ?? 0)}</span>
      </div>
      {list.length === 0 ? (
        <p className="status-info" style={{ fontSize: "0.85em", margin: 0 }}>
          No providers configured. Set MUSE_TELEGRAM_BOT_TOKEN / MUSE_DISCORD_BOT_TOKEN /
          MUSE_SLACK_BOT_TOKEN / MUSE_LINE_CHANNEL_ACCESS_TOKEN to enable.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <select
              aria-label="Messaging provider"
              value={effective}
              onChange={(event) => setProviderId(event.target.value)}
              style={{ flex: 1 }}
            >
              {list.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
            {supportsSource ? (
              <input
                aria-label="Channel id"
                placeholder={requiresSource ? "Channel id" : "Channel id (blank = all)"}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                style={{ flex: 1 }}
              />
            ) : null}
            {supportsPullNow ? (
              <button
                aria-label="Pull now"
                type="button"
                disabled={pollNow.isPending || (requiresSource && source.length === 0)}
                onClick={() => { setPollStatus(null); pollNow.mutate(); }}
              >
                {pollNow.isPending ? "Pulling…" : "Pull now"}
              </button>
            ) : null}
            <button
              aria-label="Pull all"
              type="button"
              disabled={pollAll.isPending}
              onClick={() => { setPollAllStatus(null); pollAll.mutate(); }}
            >
              {pollAll.isPending ? "Pulling…" : "Pull all"}
            </button>
          </div>
          {pollStatus ? (
            <p className="status-info" style={{ fontSize: "0.8em", margin: "0 0 0.5rem 0" }}>{pollStatus}</p>
          ) : null}
          {pollAllStatus ? (
            <p className="status-info" style={{ fontSize: "0.8em", margin: "0 0 0.5rem 0" }}>{pollAllStatus}</p>
          ) : null}
          {inbox.error ? (
            <p className="status-error">{inbox.error instanceof Error ? inbox.error.message : "Failed to load inbox"}</p>
          ) : null}
          <ul className="record-list">
            {(inbox.data?.inbound ?? []).map((message) => (
              <li key={`${message.providerId}:${message.messageId}`}>
                <strong>{message.sender ?? message.source}</strong>
                <span style={{ marginLeft: "0.5rem" }}>{message.text}</span>
                <span className="risk-read" style={{ marginLeft: "0.5rem" }}>
                  {new Date(message.receivedAtIso).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          {sendError ? <p className="status-error">{sendError}</p> : null}
          <form
            className="connection-form"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmedDest = destination.trim();
              const trimmedText = draft.trim();
              if (effective.length > 0 && trimmedDest.length > 0 && trimmedText.length > 0) {
                sendMessage.mutate({ destination: trimmedDest, text: trimmedText });
              }
            }}
            style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}
          >
            <input
              aria-label="Send destination"
              placeholder={
                effective === "telegram"
                  ? "chat_id (e.g. @me)"
                  : effective === "line"
                  ? "userId / groupId / roomId"
                  : effective === "slack"
                  ? "channel id (Cxxx) or user id (Uxxx)"
                  : "channel id"
              }
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
            <textarea
              aria-label="Send message text"
              placeholder="Message text…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
            />
            <button
              type="submit"
              disabled={
                sendMessage.isPending
                || effective.length === 0
                || destination.trim().length === 0
                || draft.trim().length === 0
              }
            >
              Send
            </button>
          </form>
        </>
      )}
    </section>
  );
}
