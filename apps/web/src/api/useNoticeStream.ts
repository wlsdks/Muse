import { useEffect, useRef } from "react";

import type { ProactiveNotice } from "./types.js";

/**
 * Subscribes to the server's `GET /api/agent-notices/stream?userId=…`
 * SSE feed and invokes `onNotice` for every `notice` event. Uses fetch
 * streaming (not EventSource) so the bearer token rides on the request.
 * Reconnects with a fixed backoff after a drop, and tears the stream
 * down cleanly on unmount or dependency change.
 */
export function useNoticeStream(
  baseUrl: string,
  token: string,
  userId: string,
  onNotice: (notice: ProactiveNotice) => void
): void {
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      controller = new AbortController();
      try {
        const url = new URL("/api/agent-notices/stream", baseUrl);
        url.searchParams.set("userId", userId);
        const res = await fetch(url.toString(), {
          headers: {
            accept: "text/event-stream",
            ...(token ? { authorization: `Bearer ${token}` } : {})
          },
          signal: controller.signal
        });
        if (!res.ok || !res.body) {
          throw new Error(`stream ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            let eventName = "message";
            let dataLine = "";
            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) {
                eventName = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataLine = line.slice(6);
              }
            }
            if (eventName === "notice" && dataLine) {
              try {
                onNoticeRef.current(JSON.parse(dataLine) as ProactiveNotice);
              } catch {
                /* ignore malformed notice */
              }
            }
          }
        }
      } catch {
        /* network error / abort — fall through to reconnect */
      }
      if (!cancelled) {
        retry = setTimeout(() => void connect(), 4000);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      controller?.abort();
      if (retry) {
        clearTimeout(retry);
      }
    };
  }, [baseUrl, token, userId]);
}
