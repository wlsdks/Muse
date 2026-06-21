import { useQuery } from "@tanstack/react-query";

import { AsyncBlock, Badge, Card, Stat } from "../components/ui.js";
import { useI18n } from "../i18n/index.js";
import { formatProbabilityPct } from "../lib/percent.js";
import { summarizeWeaknesses, weaknessAxisLabel } from "./self-improvement.js";

import type { ApiClient } from "../api/client.js";
import type { WeaknessesResponse } from "../api/types.js";

export function SelfImprovementView({ client }: { client: ApiClient }) {
  const { t } = useI18n();

  const weaknesses = useQuery({
    queryFn: () => client.get<WeaknessesResponse>("/api/self-improvement/weaknesses"),
    queryKey: ["self-improvement", client.baseUrl]
  });

  const entries = weaknesses.data?.entries ?? [];
  const { total, axes } = summarizeWeaknesses(entries);

  return (
    <div className="content-narrow">
      <p className="eyebrow">{t("group.system")}</p>
      <h1 className="page-title">{t("si.title")}</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {t("si.subtitle", { n: total, a: axes })}
      </p>

      <div style={{ marginTop: 16 }}>
        <AsyncBlock loading={weaknesses.isLoading} error={weaknesses.error} empty={entries.length === 0}>
          {entries.map((entry, idx) => (
            <div key={`${entry.axis}:${entry.topic}:${idx}`} style={{ marginBottom: 10 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Badge tone="neutral">{weaknessAxisLabel(entry.axis)}</Badge>
                      <strong>{entry.topic}</strong>
                    </div>
                    {entry.hint ? (
                      <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                        {entry.hint}
                      </p>
                    ) : null}
                    <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted, #888)" }}>
                      {t("si.lastSeen")}: <span className="mono">{entry.lastSeen}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <span className="mono subtle">{t("si.count", { n: entry.count })}</span>
                    {entry.pKnown !== null ? (
                      <Stat value={formatProbabilityPct(entry.pKnown)} label={t("si.mastery")} />
                    ) : null}
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </AsyncBlock>
      </div>
    </div>
  );
}
