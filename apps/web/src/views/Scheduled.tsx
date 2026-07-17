import { useI18n } from "../i18n/index.js";
import { UpcomingTab } from "./Autonomy.js";

import type { ApiClient } from "../api/client.js";

export function ScheduledView({ client }: { client: ApiClient }) {
  const { t } = useI18n();
  return (
    <div className="content-narrow">
      <p className="eyebrow">{t("group.automation")}</p>
      <h1 className="page-title">{t("nav.scheduled")}</h1>
      <p className="muted" style={{ marginTop: 4, marginBottom: 16 }}>{t("scheduled.subtitle")}</p>
      <UpcomingTab client={client} />
    </div>
  );
}
