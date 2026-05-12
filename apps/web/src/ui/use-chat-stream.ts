import { useCallback, useState } from "react";

import type { ChatResponse, Citation } from "./app-types.js";

/**
 * Streaming chat hook. Owns the SSE parsing for the
 * `/api/chat` endpoint (event types: `delta` / `message` /
 * `tool_call` / `citations` / `done`) plus the non-streaming
 * JSON fallback when the server returns `application/json`
 * instead of `text/event-stream`.
 *
 * Lifted out of `App.tsx` so the ChatPanel can stay focused on
 * presentation and the streaming details have their own test
 * surface (future).
 */
export function useChatStream(baseUrl: string, token: string) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<string>("");
  const [citations, setCitations] = useState<readonly Citation[]>([]);
  const [searchStatus, setSearchStatus] = useState<string>("");

  const send = useCallback(async (userMessage: string) => {
    setIsPending(true);
    setError(null);
    setResponse("");
    setCitations([]);
    setSearchStatus("");

    try {
      const res = await fetch(new URL("/api/chat", baseUrl).toString(), {
        body: JSON.stringify({ message: userMessage }),
        headers: {
          "accept": "text/event-stream",
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        method: "POST"
      });

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const contentType = res.headers.get("content-type") ?? "";

      // Non-streaming fallback: server returned JSON directly
      if (!contentType.includes("text/event-stream")) {
        const body = await res.json() as ChatResponse;
        setResponse(body.response ?? body.content ?? "");
        if (body.citations && body.citations.length > 0) {
          setCitations(body.citations);
        }
        return;
      }

      // SSE streaming path
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream on response");
      }
      const decoder = new TextDecoder();
      let buffer = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (separated by double newline)
        const parts = buffer.split("\n\n");
        // Keep incomplete last part in buffer
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let eventName = "message";
          let dataLine = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataLine = line.slice(6);
            }
          }

          if (!dataLine) continue;

          if (eventName === "done") {
            // Final JSON payload with full response + citations
            try {
              const payload = JSON.parse(dataLine) as ChatResponse;
              if (payload.response ?? payload.content) {
                setResponse(payload.response ?? payload.content ?? "");
              }
              if (payload.citations && payload.citations.length > 0) {
                setCitations(payload.citations);
              }
            } catch {
              // not JSON — ignore
            }
          } else if (eventName === "delta" || eventName === "message") {
            try {
              const payload = JSON.parse(dataLine) as { delta?: string; content?: string };
              const chunk = payload.delta ?? payload.content ?? "";
              if (chunk) {
                setResponse((prev) => prev + chunk);
              }
            } catch {
              // plain text delta
              setResponse((prev) => prev + dataLine);
            }
          } else if (eventName === "tool_call") {
            try {
              const payload = JSON.parse(dataLine) as { phase?: string };
              if (payload.phase === "started") {
                setSearchStatus("[Searching...]");
              } else if (payload.phase === "finished") {
                setSearchStatus("");
              }
            } catch {
              // ignore malformed tool_call events
            }
          } else if (eventName === "citations") {
            try {
              const payload = JSON.parse(dataLine) as readonly Citation[];
              if (Array.isArray(payload) && payload.length > 0) {
                setCitations(payload);
              }
            } catch {
              // ignore malformed citations events
            }
          }
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "request failed");
    } finally {
      setIsPending(false);
      setSearchStatus("");
    }
  }, [baseUrl, token]);

  return { citations, error, isPending, response, searchStatus, send };
}
