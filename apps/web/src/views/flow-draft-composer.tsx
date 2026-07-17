import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "@muse/shared/browser";

import { Button } from "../components/ui.js";
import { useI18n } from "../i18n/index.js";
import { describeDraftRevision } from "./flow-draft-diff.js";

import type { ApiClient } from "../api/client.js";
import type { FlowDraftPayloadRow, FlowDraftResponse } from "../api/types.js";

const FLOW_DRAFT_URL = "/api/flows/draft";

interface ThreadEntry {
  readonly role: "user" | "assistant";
  readonly text: string;
}

interface DraftRequest {
  readonly text: string;
  readonly currentDraft?: FlowDraftPayloadRow;
}

/**
 * "코파일럿 초안": a one-line description → `POST /api/flows/draft` → the
 * parsed draft is handed to the caller (which opens `FlowCreatePanel`
 * prefilled). This component NEVER creates a job itself — draft-first,
 * same discipline as every other outbound/mutating surface in this repo.
 *
 * Once `currentDraft` is present (the create panel is open), the SAME
 * composer becomes conversational: every further turn is a REVISION against
 * the panel's LIVE form values — "아니 8시 반으로 바꿔줘" updates the same
 * draft in place instead of starting over, and a one-line Muse ack naming
 * the changed field(s) joins the thread.
 */
export function FlowDraftComposer({
  client,
  onDrafted,
  currentDraft
}: {
  client: ApiClient;
  onDrafted: (draft: FlowDraftPayloadRow) => void;
  /** The live create-panel form state, projected into the copilot's 5-field
   * shape — undefined before any draft exists (first-turn mode), present
   * once the panel is open (every further turn is a revision). */
  currentDraft?: FlowDraftPayloadRow;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [thread, setThread] = useState<readonly ThreadEntry[]>([]);
  const isRevision = currentDraft !== undefined;

  const draft = useMutation({
    mutationFn: (request: DraftRequest) =>
      client.post<FlowDraftResponse>(
        FLOW_DRAFT_URL,
        request.currentDraft ? { currentDraft: request.currentDraft, text: request.text } : { text: request.text }
      ),
    onSuccess: (response, request) => {
      setText("");
      const priorDraft = request.currentDraft;
      if (priorDraft) {
        setThread((previous) => [
          ...previous,
          { role: "user", text: request.text },
          { role: "assistant", text: describeDraftRevision(priorDraft, response.draft, t) }
        ]);
      }
      onDrafted(response.draft);
    }
  });

  const canDraft = text.trim().length > 0 && !draft.isPending;
  const submit = () => draft.mutate({ currentDraft, text: text.trim() });

  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
      {thread.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {thread.map((entry, index) => (
            <div key={index} className={entry.role === "assistant" ? "subtle" : undefined} style={{ fontSize: 13 }}>
              {entry.text}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          aria-label={t("auto.flows.draft.inputLabel")}
          className="input"
          type="text"
          placeholder={isRevision ? t("auto.flows.draft.revisionPlaceholder") : t("auto.flows.draft.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button variant="secondary" size="sm" disabled={!canDraft} onClick={submit}>
          {draft.isPending
            ? t(isRevision ? "auto.flows.draft.revising" : "auto.flows.draft.drafting")
            : t(isRevision ? "auto.flows.draft.sendButton" : "auto.flows.draft.button")}
        </Button>
      </div>
      {draft.error && <div className="banner err">{errorMessage(draft.error, t("auto.flows.draft.fallbackFailed"))}</div>}
    </div>
  );
}
