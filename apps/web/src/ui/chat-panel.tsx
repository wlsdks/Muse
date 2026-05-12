import { useState } from "react";

import { useChatStream } from "./use-chat-stream.js";

import type { ApiClient } from "./api-client.js";

export function ChatPanel({ client: _client, apiUrl, token }: { readonly client: ApiClient; readonly apiUrl: string; readonly token: string }) {
  const [message, setMessage] = useState("");
  const stream = useChatStream(apiUrl, token);

  return (
    <section className="tool-surface" aria-label="Ask Muse">
      <div className="surface-heading">
        <h2>Ask Muse</h2>
        <span>{stream.isPending ? "Running" : "Ready"}</span>
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = message.trim();
          if (!trimmed) return;
          void stream.send(trimmed);
        }}
      >
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Compare two product directions, clarify tradeoffs, or choose a next step."
        />
        <button type="submit" disabled={stream.isPending || message.trim().length === 0}>
          Run
        </button>
      </form>
      <output className="chat-output">
        {stream.error
          ? `Error: ${stream.error}`
          : stream.response}
        {stream.searchStatus ? (
          <span className="search-status">{stream.searchStatus}</span>
        ) : null}
      </output>
      {stream.citations.length > 0 && (
        <div className="muse-citations">
          {stream.citations.map((c, i) => (
            <a
              key={c.url}
              className="muse-citation-chip"
              href={c.url}
              target="_blank"
              rel="noreferrer noopener"
              title={c.url}
            >
              [{i + 1}] {c.title}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
