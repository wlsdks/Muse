import { useQuery } from "@tanstack/react-query";

import { Card } from "../components/ui.js";
import { useI18n } from "../i18n/index.js";

import type { ApiClient } from "../api/client.js";
import type { BoardResponse, BoardTaskRow } from "../api/types.js";

const COLUMNS = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" }
] as const;

function BoardCard({ task }: { task: BoardTaskRow }) {
  return (
    <div style={{ border: "1px solid var(--border, #2a2a2a)", borderRadius: 8, fontSize: 13, padding: "8px 10px" }}>
      <div style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{task.title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", fontSize: 11, gap: 6, marginTop: 4, opacity: 0.7 }}>
        {task.decomposed === true && <span>container{task.synthesize === true ? " · synthesis" : ""}</span>}
        {task.dependsOn.length > 0 && <span>⟵ {task.dependsOn.length.toString()} dep</span>}
      </div>
      {task.blockedReason !== undefined && task.blockedReason.length > 0 && (
        <div style={{ color: "var(--warn, #d88)", fontSize: 11, marginTop: 4, overflowWrap: "anywhere" }}>{task.blockedReason}</div>
      )}
    </div>
  );
}

export function BoardView({ client }: { client: ApiClient }) {
  const { t } = useI18n();
  const board = useQuery({
    queryFn: () => client.get<BoardResponse>("/api/board"),
    queryKey: ["board", client.baseUrl]
  });
  const tasks = board.data?.tasks ?? [];
  return (
    <div className="content">
      <p className="eyebrow">{t("group.workspace")}</p>
      <h1 className="page-title">{t("nav.board")}</h1>
      {tasks.length === 0 && <p className="muted">{t("board.empty")}</p>}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {COLUMNS.map((col) => {
          const inCol = tasks.filter((tk) => tk.status === col.id);
          return (
            <div key={col.id} style={{ flex: "0 0 220px", minWidth: 0 }}>
              <Card title={col.label} count={inCol.length}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {inCol.map((tk) => <BoardCard key={tk.id} task={tk} />)}
                  {inCol.length === 0 && <span className="muted" style={{ fontSize: 12 }}>—</span>}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
