import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AsyncBlock, Badge, Button, Card, Empty, Icon } from "../components/ui.js";
import { useI18n } from "../i18n/index.js";
import { safeDateTime } from "../lib/datetime.js";
import { actionResultLabel, objectiveStatusLabel } from "./autonomy-labels.js";
import { nextTabIndex } from "./tabKeyNav.js";
import { timeUntil } from "./Today.js";
import { consumePersonalStatusFocus, focusPersonalStatusTarget } from "./personal-status-navigation.js";

import type { ApiClient } from "../api/client.js";
import type {
  ActionsResponse,
  AutomationUpcomingResponse,
  ObjectivesResponse,
  ProgressiveAutonomyReviewDecision,
  ProgressiveAutonomyReviewOpportunity,
  ProgressiveAutonomyReviewResponse,
  VetoesResponse
} from "../api/types.js";
import type { StringKey, Translate } from "../i18n/index.js";

type Tab = "actions" | "objectives" | "vetoes";
const TABS: readonly { id: Tab; labelKey: StringKey }[] = [
  { id: "actions", labelKey: "auto.tab.actions" },
  { id: "objectives", labelKey: "auto.tab.objectives" },
  { id: "vetoes", labelKey: "auto.tab.vetoes" }
];

function resultTone(result: string): "ok" | "warn" | "err" | "neutral" {
  if (result === "performed") return "ok";
  if (result === "refused") return "warn";
  if (result === "failed") return "err";
  return "neutral";
}
function statusTone(status: string): "ok" | "accent" | "neutral" {
  if (status === "done") return "ok";
  if (status === "active") return "accent";
  return "neutral";
}

export function AutonomyView({ client }: { client: ApiClient }) {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<Tab>("actions");

  useEffect(() => {
    if (consumePersonalStatusFocus("autonomy") === "vetoes") {
      setTab("vetoes");
      focusPersonalStatusTarget("vetoes");
    }
  }, []);

  return (
    <div className="content-narrow">
      <p className="eyebrow">{t("group.system")}</p>
      <h1 className="page-title">{t("nav.autonomy")}</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {t("auto.subtitle")}
      </p>

      <div style={{ marginTop: 16 }}>
        <ShadowReviewCard client={client} locale={locale} />
      </div>

      <div className="tabs" style={{ margin: "16px 0" }} role="tablist" aria-label={t("nav.autonomy")}>
        {TABS.map((entry, i) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            tabIndex={tab === entry.id ? 0 : -1}
            className={`tab${tab === entry.id ? " active" : ""}`}
            onClick={() => setTab(entry.id)}
            onKeyDown={(e) => {
              const next = nextTabIndex(i, e.key, TABS.length);
              const target = TABS[next];
              if (target && next !== i) {
                e.preventDefault();
                setTab(target.id);
              }
            }}
          >
            {t(entry.labelKey)}
          </button>
        ))}
      </div>

      {tab === "actions" && <ActionsTab client={client} locale={locale} />}
      {tab === "objectives" && <ObjectivesTab client={client} locale={locale} />}
      {tab === "vetoes" && <div id="vetoes" tabIndex={-1}><VetoesTab client={client} locale={locale} /></div>}
    </div>
  );
}

const REVIEW_QUERY_KEY = "autonomy-review";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

function sourceAllowsDecision(
  opportunity: ProgressiveAutonomyReviewOpportunity,
  decision: ProgressiveAutonomyReviewDecision
): boolean {
  return opportunity.currentSource.state !== "unavailable"
    && !(opportunity.currentSource.state === "stale" && decision === "would-approve");
}

function ShadowReviewCard({ client, locale }: { client: ApiClient; locale: string }) {
  const { t } = useI18n();
  const queryKey = [REVIEW_QUERY_KEY, client.baseUrl] as const;
  const q = useQuery({
    queryFn: () => client.get<ProgressiveAutonomyReviewResponse>("/api/autonomy/review"),
    queryKey
  });

  return (
    <Card title={t("auto.review.title")}>
      <p className="subtle" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        {t("auto.review.notice")}
      </p>
      <div aria-live="polite">
        <AsyncBlock
          loading={q.isLoading}
          error={q.error}
          empty={q.data?.opportunity === null}
          emptyLabel={t("auto.review.empty")}
        >
          {q.data?.opportunity && (
            <ShadowReviewOpportunityForm
              key={q.data.opportunity.opportunityId}
              client={client}
              locale={locale}
              opportunity={q.data.opportunity}
              queryKey={queryKey}
              refetching={q.isFetching}
              onRefetch={async () => { await q.refetch(); }}
            />
          )}
        </AsyncBlock>
      </div>
    </Card>
  );
}

function ShadowReviewOpportunityForm({
  client,
  locale,
  opportunity,
  queryKey,
  refetching,
  onRefetch
}: {
  readonly client: ApiClient;
  readonly locale: string;
  readonly opportunity: ProgressiveAutonomyReviewOpportunity;
  readonly queryKey: readonly [typeof REVIEW_QUERY_KEY, string];
  readonly refetching: boolean;
  readonly onRefetch: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<ProgressiveAutonomyReviewDecision | null>(null);
  const [reason, setReason] = useState("");
  const normalizedReason = reason.trim();
  const { t } = useI18n();
  const reasonError = CONTROL_CHARACTER_PATTERN.test(normalizedReason) || normalizedReason.length > 500
    ? t("auto.review.reasonInvalid")
    : null;
  const mutation = useMutation({
    mutationFn: async (input: {
      readonly decision: ProgressiveAutonomyReviewDecision;
      readonly opportunityId: string;
      readonly reason?: string;
    }) => client.post(
      `/api/autonomy/opportunities/${encodeURIComponent(input.opportunityId)}/decision`,
      { decision: input.decision, ...(input.reason === undefined ? {} : { reason: input.reason }) }
    ),
    onError: async () => {
      await onRefetch();
    },
    onSuccess: async () => {
      setDecision(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey });
    },
    retry: false
  });
  const busy = mutation.isPending || refetching;

  return (
    <ShadowReviewForm
      busy={busy}
      decision={decision}
      locale={locale}
      mutationError={mutation.error}
      opportunity={opportunity}
      reason={reason}
      reasonError={reasonError}
      onDecision={setDecision}
      onReason={setReason}
      onSubmit={() => {
        if (!decision || reasonError || !sourceAllowsDecision(opportunity, decision)) return;
        mutation.mutate({
          decision,
          opportunityId: opportunity.opportunityId,
          ...(normalizedReason.length === 0 ? {} : { reason: normalizedReason })
        });
      }}
    />
  );
}

function ShadowReviewForm({
  busy,
  decision,
  locale,
  mutationError,
  opportunity,
  reason,
  reasonError,
  onDecision,
  onReason,
  onSubmit
}: {
  readonly busy: boolean;
  readonly decision: ProgressiveAutonomyReviewDecision | null;
  readonly locale: string;
  readonly mutationError: Error | null;
  readonly opportunity: ProgressiveAutonomyReviewOpportunity;
  readonly reason: string;
  readonly reasonError: string | null;
  readonly onDecision: (decision: ProgressiveAutonomyReviewDecision) => void;
  readonly onReason: (reason: string) => void;
  readonly onSubmit: () => void;
}) {
  const { t } = useI18n();
  const options: readonly { readonly label: StringKey; readonly value: ProgressiveAutonomyReviewDecision }[] = [
    { label: "auto.review.wouldApprove", value: "would-approve" },
    { label: "auto.review.wouldDeny", value: "would-deny" },
    { label: "auto.review.needsAdjustment", value: "needs-adjustment" }
  ];
  const sourceState = opportunity.currentSource.state;
  const sourceUnavailable = sourceState === "unavailable";
  const decisionAllowed = decision === null || sourceAllowsDecision(opportunity, decision);
  const sourceLabel = t(`auto.review.source.${sourceState}`);
  const sourceTone = sourceState === "exact" ? "ok" : sourceState === "stale" ? "warn" : "err";

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="row-main">
          <div className="label">{t("auto.review.action")}</div>
          <div className="row-title">{opportunity.action}</div>
          <div className="row-meta">{t("auto.review.scope", { taskId: opportunity.taskId, threadId: opportunity.threadId })}</div>
          <div className="row-meta">{t("auto.review.linkedAt", { when: safeDateTime(opportunity.linkedAt, locale) })}</div>
          <div className="row-meta">{t("auto.review.recordedAt", { when: safeDateTime(opportunity.recordedAt, locale) })}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="label">{t("auto.review.source")}</div>
          <Badge tone={sourceTone}>{sourceLabel}</Badge>
          {sourceState !== "exact" && (
            <div className="row-meta" style={{ marginTop: 4 }}>{opportunity.currentSource.reason}</div>
          )}
        </div>
      </div>
      <dl style={{ display: "grid", gap: 8, margin: "12px 0" }}>
        <div>
          <dt className="label">{t("auto.review.assessment")}</dt>
          <dd style={{ margin: 0 }}>{opportunity.shadowAssessment}</dd>
        </div>
        <div>
          <dt className="label">{t("auto.review.rationale")}</dt>
          <dd className="subtle" style={{ margin: 0 }}>{opportunity.shadowRationale}</dd>
        </div>
      </dl>
      <fieldset disabled={busy || sourceUnavailable} style={{ border: 0, margin: "12px 0", padding: 0 }}>
        <legend className="label">{t("auto.review.decision")}</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {options.map((option) => (
            <label key={option.value}>
              <input
                checked={decision === option.value}
                disabled={sourceState === "stale" && option.value === "would-approve"}
                name="autonomy-shadow-decision"
                type="radio"
                value={option.value}
                onChange={() => onDecision(option.value)}
              />{" "}{t(option.label)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="label" htmlFor="autonomy-shadow-reason">{t("auto.review.reason")}</label>
      <textarea
        aria-describedby={reasonError ? "autonomy-shadow-reason-error" : undefined}
        aria-invalid={reasonError ? true : undefined}
        className="textarea"
        disabled={busy || sourceUnavailable}
        id="autonomy-shadow-reason"
        placeholder={t("auto.review.reasonPlaceholder")}
        value={reason}
        onChange={(event) => onReason(event.target.value)}
      />
      {reasonError && <p className="field-error" id="autonomy-shadow-reason-error" role="alert">{reasonError}</p>}
      {mutationError && <p className="field-error" role="alert">{t("auto.review.failed")}</p>}
      <div style={{ marginTop: 12 }}>
        <Button disabled={busy || sourceUnavailable || decision === null || !decisionAllowed || reasonError !== null} type="submit" variant="primary">
          {busy ? t("auto.review.submitting") : t("auto.review.submit")}
        </Button>
      </div>
    </form>
  );
}

export function UpcomingTab({ client }: { client: ApiClient }) {
  const { locale, t } = useI18n();
  const q = useQuery({
    queryFn: () => client.get<AutomationUpcomingResponse>("/api/automation/upcoming"),
    queryKey: ["automation-upcoming", client.baseUrl]
  });
  return (
    <AsyncBlock loading={q.isLoading} error={q.error} empty={false}>
      {q.data && <UpcomingSections data={q.data} t={t} locale={locale} />}
    </AsyncBlock>
  );
}

/**
 * Pure presentational render of the four upcoming-automation sections —
 * kept separate from `UpcomingTab` so it's directly testable with a
 * constructed `AutomationUpcomingResponse`, no query resolution needed.
 * Each section renders only when its data is non-null/non-empty; the
 * overall empty state fires only when all four are absent.
 */
export function UpcomingSections({
  data,
  t,
  locale
}: {
  data: AutomationUpcomingResponse;
  t: Translate;
  locale: string;
}) {
  const hasDigest = data.digest !== null;
  const hasBudget = data.budget !== null;
  const hasJobs = data.scheduledJobs.length > 0;
  const hasReminder = data.nextReminder !== null;

  if (!hasDigest && !hasBudget && !hasJobs && !hasReminder) {
    return (
      <Empty icon={<Icon.clock />} hint={t("auto.upcoming.emptyHint")}>
        {t("auto.upcoming.emptyTitle")}
      </Empty>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {data.digest && <DigestCard digest={data.digest} t={t} locale={locale} />}
      {data.budget && <BudgetCard budget={data.budget} t={t} />}
      {data.scheduledJobs.length > 0 && <JobsCard jobs={data.scheduledJobs} t={t} locale={locale} />}
      {data.nextReminder && <ReminderCard reminder={data.nextReminder} t={t} locale={locale} />}
    </div>
  );
}

function DigestCard({
  digest,
  t,
  locale
}: {
  digest: NonNullable<AutomationUpcomingResponse["digest"]>;
  t: Translate;
  locale: string;
}) {
  const when = timeUntil(digest.nextAtIso, t) || safeDateTime(digest.nextAtIso, locale);
  return (
    <Card title={t("auto.upcoming.digestTitle")}>
      <div className="row">
        <div className="row-main">
          <div className="row-title">{t("auto.upcoming.digestLine", { hour: digest.hour, when })}</div>
        </div>
        {!digest.enabled && <Badge tone="neutral">{t("auto.upcoming.digestOff")}</Badge>}
      </div>
    </Card>
  );
}

function BudgetCard({ budget, t }: { budget: NonNullable<AutomationUpcomingResponse["budget"]>; t: Translate }) {
  const hourLeft = Math.max(0, budget.hourCap - budget.hourUsed);
  const dayLeft = Math.max(0, budget.dayCap - budget.dayUsed);
  return (
    <Card title={t("auto.upcoming.budgetTitle")}>
      <div className="row-title">
        {t("auto.upcoming.budgetLine", { dayCap: budget.dayCap, dayLeft, hourCap: budget.hourCap, hourLeft })}
      </div>
      <p className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
        {t("auto.upcoming.budgetExplainer")}
      </p>
    </Card>
  );
}

function JobsCard({
  jobs,
  t,
  locale
}: {
  jobs: AutomationUpcomingResponse["scheduledJobs"];
  t: Translate;
  locale: string;
}) {
  return (
    <Card title={t("auto.upcoming.jobsTitle")} count={jobs.length}>
      {jobs.map((job) => (
        <div className="row" key={job.id}>
          <div className="row-main">
            <div className="row-title">{job.label}</div>
            {job.nextRunAtIso && <div className="row-meta">{safeDateTime(job.nextRunAtIso, locale)}</div>}
          </div>
        </div>
      ))}
    </Card>
  );
}

function ReminderCard({
  reminder,
  t,
  locale
}: {
  reminder: NonNullable<AutomationUpcomingResponse["nextReminder"]>;
  t: Translate;
  locale: string;
}) {
  return (
    <Card title={t("auto.upcoming.reminderTitle")}>
      <div className="row">
        <div className="row-main">
          <div className="row-title">{reminder.text}</div>
          <div className="row-meta">{safeDateTime(reminder.dueAtIso, locale)}</div>
        </div>
      </div>
    </Card>
  );
}

function ActionsTab({ client, locale }: { client: ApiClient; locale: string }) {
  const { t } = useI18n();
  const q = useQuery({
    queryFn: () => client.get<ActionsResponse>("/api/actions?limit=100"),
    queryKey: ["actions", client.baseUrl]
  });
  const list = q.data?.actions ?? [];
  return (
    <Card title={t("auto.tab.actions")} count={q.data?.total ?? 0}>
      <AsyncBlock loading={q.isLoading} error={q.error} empty={list.length === 0}>
        {list.map((a) => (
          <div className="row" key={a.id}>
            <div className="row-main">
              <div className="row-title">{a.what}</div>
              <div className="row-meta">
                {a.why}
                {a.detail ? ` · ${a.detail}` : ""} · {new Date(a.when).toLocaleString(locale)}
              </div>
            </div>
            <Badge tone={resultTone(a.result)}>{actionResultLabel(a.result, t)}</Badge>
          </div>
        ))}
      </AsyncBlock>
    </Card>
  );
}

function ObjectivesTab({ client, locale }: { client: ApiClient; locale: string }) {
  const { t } = useI18n();
  const q = useQuery({
    queryFn: () => client.get<ObjectivesResponse>("/api/objectives"),
    queryKey: ["objectives", client.baseUrl]
  });
  const list = q.data?.objectives ?? [];
  return (
    <Card title={t("auto.tab.objectives")} count={q.data?.total ?? 0}>
      <p className="subtle" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        {t("auto.objNote")}
      </p>
      <AsyncBlock loading={q.isLoading} error={q.error} empty={list.length === 0}>
        {list.map((o) => (
          <div className="row" key={o.id}>
            <div className="row-main">
              <div className="row-title">{o.spec}</div>
              <div className="row-meta">
                {o.kind} · {new Date(o.createdAt).toLocaleDateString(locale)}
                {o.resolution ? ` · ${o.resolution}` : ""}
              </div>
            </div>
            <Badge tone={statusTone(o.status)}>{objectiveStatusLabel(o.status, t)}</Badge>
          </div>
        ))}
      </AsyncBlock>
    </Card>
  );
}

function VetoesTab({ client, locale }: { client: ApiClient; locale: string }) {
  const { t } = useI18n();
  const q = useQuery({
    queryFn: () => client.get<VetoesResponse>("/api/vetoes"),
    queryKey: ["vetoes", client.baseUrl]
  });
  const list = q.data?.vetoes ?? [];
  return (
    <Card title={t("auto.tab.vetoes")} count={q.data?.total ?? 0}>
      <p className="subtle" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        {t("auto.vetoNote")}
      </p>
      <AsyncBlock loading={q.isLoading} error={q.error} empty={list.length === 0}>
        {list.map((v) => (
          <div className="row" key={v.id}>
            <div className="row-main">
              <div className="row-title">{v.scope}</div>
              <div className="row-meta">
                {v.reason ? `${v.reason} · ` : ""}
                {safeDateTime(v.vetoedAt, locale)}
              </div>
            </div>
            <Badge tone="warn">{t("auto.vetoBadge")}</Badge>
          </div>
        ))}
      </AsyncBlock>
    </Card>
  );
}
