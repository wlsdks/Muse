import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useNoticeStream } from "../api/useNoticeStream.js";
import { useI18n } from "../i18n/index.js";

import type { ApiClient } from "../api/client.js";

interface Toast {
  readonly id: number;
  readonly text: string;
}

/**
 * Live proactive-notice toasts. Subscribes to the agent-notices SSE
 * stream and surfaces each notice as a dismissible toast, and refreshes
 * the proactive-history queries so Today/Activity stay in sync.
 */
export function NoticeToaster({ client, token, userId }: { client: ApiClient; token: string; userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((cur) => cur.filter((x) => x.id !== id)), []);

  const onNotice = useCallback(
    (notice: { message?: string; text?: string }) => {
      const text = notice.message ?? notice.text ?? "";
      if (!text.trim()) {
        return;
      }
      const id = Date.now() + Math.random();
      setToasts((cur) => [...cur.slice(-3), { id, text }]);
      window.setTimeout(() => dismiss(id), 9000);
      void qc.invalidateQueries({ queryKey: ["proactive"] });
      void qc.invalidateQueries({ queryKey: ["proactive-all"] });
    },
    [dismiss, qc]
  );

  useNoticeStream(client.baseUrl, token, userId, onNotice);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id} role="status">
          <div className="toast-mark">M</div>
          <div className="toast-body">
            <div className="toast-title">{t("notice.title")}</div>
            <div className="toast-text">{toast.text}</div>
          </div>
          <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label={t("common.close")}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
