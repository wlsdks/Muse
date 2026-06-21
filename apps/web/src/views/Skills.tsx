import { useQuery } from "@tanstack/react-query";

import { AsyncBlock, Badge, Card } from "../components/ui.js";
import { useI18n } from "../i18n/index.js";
import { summarizeSkills } from "./skill-list.js";

import type { ApiClient } from "../api/client.js";
import type { SkillsResponse } from "../api/types.js";

export function SkillsView({ client }: { client: ApiClient }) {
  const { t } = useI18n();
  const skills = useQuery({
    queryFn: () => client.get<SkillsResponse>("/api/self-improvement/skills"),
    queryKey: ["skills", client.baseUrl]
  });

  const entries = skills.data?.entries ?? [];
  const counts = summarizeSkills(entries);

  return (
    <div className="content-narrow">
      <p className="eyebrow">{t("group.system")}</p>
      <h1 className="page-title">{t("skills.title")}</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {t("skills.subtitle", { n: counts.total, a: counts.avoided })}
      </p>

      <div style={{ marginTop: 16 }}>
        <AsyncBlock loading={skills.isLoading} error={skills.error} empty={entries.length === 0}>
          {entries.map((entry, idx) => (
            <div key={`${entry.name}:${idx}`} style={{ marginBottom: 10 }}>
              <Card>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{entry.name}</strong>
                      <Badge tone="neutral">{entry.source}</Badge>
                      {entry.avoided ? <Badge tone="warn">{t("skills.avoided")}</Badge> : null}
                    </div>
                    {entry.description ? (
                      <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                        {entry.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="mono subtle" style={{ flexShrink: 0 }}>
                    {t("skills.reward", { n: entry.reward })}
                  </span>
                </div>
              </Card>
            </div>
          ))}
        </AsyncBlock>
      </div>
    </div>
  );
}
