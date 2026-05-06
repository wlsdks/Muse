import type { EvalCase, EvalJudgeResult } from "@muse/eval";
import type { ModelMessage, ModelProvider, ModelResponse } from "@muse/model";
import type {
  ExperimentReportTable,
  ExperimentTable,
  FeedbackTable,
  IntentDefinitionTable,
  MuseDatabase,
  PersonaTable,
  PromptTemplateTable,
  PromptVersionTable,
  TrialTable
} from "@muse/db";
import { createRunId, type JsonObject, type JsonValue } from "@muse/shared";
import type { Insertable, Kysely, Selectable } from "kysely";

export interface PromptVariant {
  readonly id: string;
  readonly name: string;
  readonly systemPrompt: string;
  readonly metadata: JsonObject;
}

export interface PromptExperiment {
  readonly id: string;
  readonly name: string;
  readonly variants: readonly PromptVariant[];
  readonly cases: readonly EvalCase[];
  readonly model: string;
  readonly metadata: JsonObject;
}

export interface PromptExperimentResult {
  readonly experimentId: string;
  readonly variantId: string;
  readonly caseId: string;
  readonly response: ModelResponse;
  readonly judge?: EvalJudgeResult;
}

export type Awaitable<T> = T | Promise<T>;

export interface FeedbackStore {
  delete(id: string): Awaitable<boolean>;
  get(id: string): Awaitable<JsonObject | undefined>;
  list(): Awaitable<readonly JsonObject[]>;
  save(record: JsonObject): Awaitable<JsonObject>;
}

export interface PromptLabExperimentStore {
  deleteExperiment(id: string): Awaitable<boolean>;
  getExperiment(id: string): Awaitable<JsonObject | undefined>;
  getReport(experimentId: string): Awaitable<JsonObject | undefined>;
  listExperiments(): Awaitable<readonly JsonObject[]>;
  listTrials(experimentId: string): Awaitable<readonly JsonObject[]>;
  saveExperiment(record: JsonObject): Awaitable<JsonObject>;
  saveReport(experimentId: string, report: JsonObject): Awaitable<JsonObject>;
  saveTrials(experimentId: string, trials: readonly JsonObject[]): Awaitable<void>;
}

export interface PromptLabCatalogStore {
  deleteIntent(name: string): Awaitable<boolean>;
  deletePersona(id: string): Awaitable<boolean>;
  deleteTemplate(id: string): Awaitable<boolean>;
  getIntent(name: string): Awaitable<JsonObject | undefined>;
  getPersona(id: string): Awaitable<JsonObject | undefined>;
  getTemplate(id: string): Awaitable<JsonObject | undefined>;
  listIntents(): Awaitable<readonly JsonObject[]>;
  listPersonas(): Awaitable<readonly JsonObject[]>;
  listTemplates(): Awaitable<readonly JsonObject[]>;
  saveIntent(record: JsonObject): Awaitable<JsonObject>;
  savePersona(record: JsonObject): Awaitable<JsonObject>;
  saveTemplate(record: JsonObject): Awaitable<JsonObject>;
}

type FeedbackRow = Selectable<FeedbackTable>;
type FeedbackInsert = Insertable<FeedbackTable>;
type ExperimentRow = Selectable<ExperimentTable>;
type ExperimentInsert = Insertable<ExperimentTable>;
type TrialRow = Selectable<TrialTable>;
type TrialInsert = Insertable<TrialTable>;
type ExperimentReportRow = Selectable<ExperimentReportTable>;
type ExperimentReportInsert = Insertable<ExperimentReportTable>;
type IntentDefinitionRow = Selectable<IntentDefinitionTable>;
type IntentDefinitionInsert = Insertable<IntentDefinitionTable>;
type PersonaRow = Selectable<PersonaTable>;
type PersonaInsert = Insertable<PersonaTable>;
type PromptTemplateRow = Selectable<PromptTemplateTable>;
type PromptTemplateInsert = Insertable<PromptTemplateTable>;
type PromptVersionRow = Selectable<PromptVersionTable>;
type PromptVersionInsert = Insertable<PromptVersionTable>;

export class InMemoryFeedbackStore implements FeedbackStore {
  private readonly feedback = new Map<string, JsonObject>();

  save(record: JsonObject): JsonObject {
    const id = stringValue(record.id) || createRunId("feedback");
    const saved = {
      ...record,
      id
    };

    this.feedback.set(id, saved);
    return saved;
  }

  list(): readonly JsonObject[] {
    return [...this.feedback.values()];
  }

  get(id: string): JsonObject | undefined {
    return this.feedback.get(id);
  }

  delete(id: string): boolean {
    return this.feedback.delete(id);
  }
}

export class KyselyFeedbackStore implements FeedbackStore {
  constructor(private readonly db: Kysely<MuseDatabase>) {}

  async save(record: JsonObject): Promise<JsonObject> {
    const row = createFeedbackInsert(record);
    const saved = await this.db
      .insertInto("feedback")
      .values(row)
      .onConflict((oc) => oc.column("feedback_id").doUpdateSet({
        comment: row.comment,
        domain: row.domain,
        duration_ms: row.duration_ms,
        intent: row.intent,
        model: row.model,
        prompt_template_id: row.prompt_template_id,
        prompt_version: row.prompt_version,
        query: row.query,
        rating: row.rating,
        response: row.response,
        review_status: row.review_status,
        reviewed_at: row.reviewed_at,
        reviewed_by: row.reviewed_by,
        run_id: row.run_id,
        session_id: row.session_id,
        tags: row.tags,
        timestamp: row.timestamp,
        tools_used: row.tools_used,
        user_id: row.user_id,
        version: row.version
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapFeedbackRow(saved);
  }

  async list(): Promise<readonly JsonObject[]> {
    const rows = await this.db.selectFrom("feedback").selectAll().orderBy("timestamp", "desc").execute();
    return rows.map(mapFeedbackRow);
  }

  async get(id: string): Promise<JsonObject | undefined> {
    const row = await this.db.selectFrom("feedback").selectAll().where("feedback_id", "=", id).executeTakeFirst();
    return row ? mapFeedbackRow(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom("feedback").where("feedback_id", "=", id).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }
}

export class InMemoryPromptLabExperimentStore implements PromptLabExperimentStore {
  private readonly experiments = new Map<string, JsonObject>();
  private readonly reports = new Map<string, JsonObject>();
  private readonly trials = new Map<string, readonly JsonObject[]>();

  saveExperiment(record: JsonObject): JsonObject {
    const id = stringValue(record.id) || createRunId("prompt_experiment");
    const saved = {
      ...record,
      id
    };
    this.experiments.set(id, saved);
    return saved;
  }

  listExperiments(): readonly JsonObject[] {
    return [...this.experiments.values()];
  }

  getExperiment(id: string): JsonObject | undefined {
    return this.experiments.get(id);
  }

  deleteExperiment(id: string): boolean {
    const deleted = this.experiments.delete(id);
    this.reports.delete(id);
    this.trials.delete(id);
    return deleted;
  }

  saveTrials(experimentId: string, trials: readonly JsonObject[]): void {
    this.trials.set(experimentId, trials.map((trial) => ({ ...trial, experimentId })));
  }

  listTrials(experimentId: string): readonly JsonObject[] {
    return this.trials.get(experimentId) ?? [];
  }

  saveReport(experimentId: string, report: JsonObject): JsonObject {
    const saved = {
      ...report,
      experimentId,
      id: stringValue(report.id) || experimentId
    };
    this.reports.set(experimentId, saved);
    return saved;
  }

  getReport(experimentId: string): JsonObject | undefined {
    return this.reports.get(experimentId);
  }
}

export class KyselyPromptLabExperimentStore implements PromptLabExperimentStore {
  constructor(private readonly db: Kysely<MuseDatabase>) {}

  async saveExperiment(record: JsonObject): Promise<JsonObject> {
    const row = createExperimentInsert(record);
    const saved = await this.db
      .insertInto("experiments")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({
        auto_generated: row.auto_generated,
        baseline_version_id: row.baseline_version_id,
        candidate_version_ids: row.candidate_version_ids,
        completed_at: row.completed_at,
        created_by: row.created_by,
        description: row.description,
        error_message: row.error_message,
        evaluation_config: row.evaluation_config,
        judge_model: row.judge_model,
        model: row.model,
        name: row.name,
        repetitions: row.repetitions,
        started_at: row.started_at,
        status: row.status,
        temperature: row.temperature,
        template_id: row.template_id,
        test_queries: row.test_queries
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapExperimentRow(saved);
  }

  async listExperiments(): Promise<readonly JsonObject[]> {
    const rows = await this.db.selectFrom("experiments").selectAll().orderBy("created_at", "desc").execute();
    return rows.map(mapExperimentRow);
  }

  async getExperiment(id: string): Promise<JsonObject | undefined> {
    const row = await this.db.selectFrom("experiments").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? mapExperimentRow(row) : undefined;
  }

  async deleteExperiment(id: string): Promise<boolean> {
    await this.db.deleteFrom("experiment_reports").where("experiment_id", "=", id).execute();
    await this.db.deleteFrom("trials").where("experiment_id", "=", id).execute();
    const result = await this.db.deleteFrom("experiments").where("id", "=", id).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }

  async saveTrials(experimentId: string, trials: readonly JsonObject[]): Promise<void> {
    await this.db.deleteFrom("trials").where("experiment_id", "=", experimentId).execute();

    if (trials.length === 0) {
      return;
    }

    await this.db.insertInto("trials").values(trials.map((trial) => createTrialInsert(experimentId, trial))).execute();
  }

  async listTrials(experimentId: string): Promise<readonly JsonObject[]> {
    const rows = await this.db
      .selectFrom("trials")
      .selectAll()
      .where("experiment_id", "=", experimentId)
      .orderBy("executed_at", "asc")
      .execute();
    return rows.map(mapTrialRow);
  }

  async saveReport(experimentId: string, report: JsonObject): Promise<JsonObject> {
    const row = createExperimentReportInsert(experimentId, report);
    const saved = await this.db
      .insertInto("experiment_reports")
      .values(row)
      .onConflict((oc) => oc.column("experiment_id").doUpdateSet({
        created_at: row.created_at,
        report_data: row.report_data
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapExperimentReportRow(saved);
  }

  async getReport(experimentId: string): Promise<JsonObject | undefined> {
    const row = await this.db
      .selectFrom("experiment_reports")
      .selectAll()
      .where("experiment_id", "=", experimentId)
      .executeTakeFirst();
    return row ? mapExperimentReportRow(row) : undefined;
  }
}

export class InMemoryPromptLabCatalogStore implements PromptLabCatalogStore {
  private readonly intents = new Map<string, JsonObject>();
  private readonly personas = new Map<string, JsonObject>();
  private readonly templates = new Map<string, JsonObject>();

  savePersona(record: JsonObject): JsonObject {
    const saved = withRecordIdentity(record, "persona");
    this.personas.set(saved.id, saved);
    return saved;
  }

  listPersonas(): readonly JsonObject[] {
    return [...this.personas.values()];
  }

  getPersona(id: string): JsonObject | undefined {
    return this.personas.get(id) ?? [...this.personas.values()].find((record) => record.name === id);
  }

  deletePersona(id: string): boolean {
    const record = this.getPersona(id);
    return record ? this.personas.delete(stringValue(record.id)) : false;
  }

  saveTemplate(record: JsonObject): JsonObject {
    const saved = withRecordIdentity(record, "prompt_template");
    this.templates.set(saved.id, saved);
    return saved;
  }

  listTemplates(): readonly JsonObject[] {
    return [...this.templates.values()];
  }

  getTemplate(id: string): JsonObject | undefined {
    return this.templates.get(id) ?? [...this.templates.values()].find((record) => record.name === id);
  }

  deleteTemplate(id: string): boolean {
    const record = this.getTemplate(id);
    return record ? this.templates.delete(stringValue(record.id)) : false;
  }

  saveIntent(record: JsonObject): JsonObject {
    const name = stringValue(record.name) || stringValue(record.id);
    const saved = withRecordIdentity({ ...record, id: name, name }, "intent");
    this.intents.set(name, saved);
    return saved;
  }

  listIntents(): readonly JsonObject[] {
    return [...this.intents.values()];
  }

  getIntent(name: string): JsonObject | undefined {
    return this.intents.get(name);
  }

  deleteIntent(name: string): boolean {
    return this.intents.delete(name);
  }
}

export class KyselyPromptLabCatalogStore implements PromptLabCatalogStore {
  constructor(private readonly db: Kysely<MuseDatabase>) {}

  async savePersona(record: JsonObject): Promise<JsonObject> {
    const row = createPersonaInsert(record);
    const saved = await this.db
      .insertInto("personas")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({
        identity: row.identity,
        is_default: row.is_default,
        name: row.name,
        prompt_template_id: row.prompt_template_id,
        system_prompt: row.system_prompt,
        updated_at: row.updated_at
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapPersonaRow(saved, record);
  }

  async listPersonas(): Promise<readonly JsonObject[]> {
    const rows = await this.db.selectFrom("personas").selectAll().orderBy("created_at", "desc").execute();
    return rows.map((row) => mapPersonaRow(row));
  }

  async getPersona(id: string): Promise<JsonObject | undefined> {
    const row = await this.db
      .selectFrom("personas")
      .selectAll()
      .where((eb) => eb.or([eb("id", "=", id), eb("name", "=", id)]))
      .executeTakeFirst();
    return row ? mapPersonaRow(row) : undefined;
  }

  async deletePersona(id: string): Promise<boolean> {
    const existing = await this.getPersona(id);
    if (!existing) {
      return false;
    }
    const result = await this.db.deleteFrom("personas").where("id", "=", stringValue(existing.id)).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }

  async saveTemplate(record: JsonObject): Promise<JsonObject> {
    const row = createPromptTemplateInsert(record);
    const versions = promptVersionRecords(record);
    const saved = await this.db
      .insertInto("prompt_templates")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({
        description: row.description,
        name: row.name,
        updated_at: row.updated_at
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.db.deleteFrom("prompt_versions").where("template_id", "=", saved.id).execute();
    if (versions.length > 0) {
      await this.db.insertInto("prompt_versions").values(versions.map((version) => createPromptVersionInsert(saved.id, version))).execute();
    }
    return { ...mapPromptTemplateRow(saved), versions };
  }

  async listTemplates(): Promise<readonly JsonObject[]> {
    const rows = await this.db.selectFrom("prompt_templates").selectAll().orderBy("created_at", "desc").execute();
    return Promise.all(rows.map((row) => this.templateWithVersions(row)));
  }

  async getTemplate(id: string): Promise<JsonObject | undefined> {
    const row = await this.db
      .selectFrom("prompt_templates")
      .selectAll()
      .where((eb) => eb.or([eb("id", "=", id), eb("name", "=", id)]))
      .executeTakeFirst();
    return row ? this.templateWithVersions(row) : undefined;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const existing = await this.getTemplate(id);
    if (!existing) {
      return false;
    }
    const templateId = stringValue(existing.id);
    await this.db.deleteFrom("prompt_versions").where("template_id", "=", templateId).execute();
    const result = await this.db.deleteFrom("prompt_templates").where("id", "=", templateId).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }

  async saveIntent(record: JsonObject): Promise<JsonObject> {
    const row = createIntentDefinitionInsert(record);
    const saved = await this.db
      .insertInto("intent_definitions")
      .values(row)
      .onConflict((oc) => oc.column("name").doUpdateSet({
        description: row.description,
        enabled: row.enabled,
        examples: row.examples,
        keywords: row.keywords,
        profile: row.profile,
        updated_at: row.updated_at
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapIntentDefinitionRow(saved);
  }

  async listIntents(): Promise<readonly JsonObject[]> {
    const rows = await this.db.selectFrom("intent_definitions").selectAll().orderBy("name", "asc").execute();
    return rows.map(mapIntentDefinitionRow);
  }

  async getIntent(name: string): Promise<JsonObject | undefined> {
    const row = await this.db.selectFrom("intent_definitions").selectAll().where("name", "=", name).executeTakeFirst();
    return row ? mapIntentDefinitionRow(row) : undefined;
  }

  async deleteIntent(name: string): Promise<boolean> {
    const result = await this.db.deleteFrom("intent_definitions").where("name", "=", name).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }

  private async templateWithVersions(row: PromptTemplateRow): Promise<JsonObject> {
    const versions = await this.db
      .selectFrom("prompt_versions")
      .selectAll()
      .where("template_id", "=", row.id)
      .orderBy("version", "asc")
      .execute();
    return {
      ...mapPromptTemplateRow(row),
      versions: versions.map(mapPromptVersionRow)
    };
  }
}

export function createFeedbackInsert(record: JsonObject): FeedbackInsert {
  return {
    comment: nullableString(record.comment),
    domain: nullableString(record.domain),
    duration_ms: nullableNumber(record.durationMs),
    feedback_id: stringValue(record.id) || createRunId("feedback"),
    intent: nullableString(record.intent),
    model: nullableString(record.model),
    prompt_template_id: nullableString(record.templateId),
    prompt_version: nullableNumber(record.promptVersion),
    query: stringValue(record.query),
    rating: stringValue(record.rating) || "thumbs_down",
    response: stringValue(record.response),
    review_status: stringValue(record.reviewStatus) || "inbox",
    reviewed_at: nullableDate(record.reviewedAt),
    reviewed_by: nullableString(record.reviewedBy),
    run_id: nullableString(record.runId),
    session_id: nullableString(record.sessionId),
    tags: jsonArray(record.tags),
    timestamp: dateValue(record.timestamp),
    tools_used: jsonArray(record.toolsUsed),
    user_id: nullableString(record.userId),
    version: numberValue(record.version, 1)
  };
}

export function mapFeedbackRow(row: FeedbackRow | FeedbackInsert): JsonObject {
  return {
    comment: row.comment ?? null,
    domain: row.domain ?? null,
    durationMs: row.duration_ms ?? null,
    id: row.feedback_id,
    intent: row.intent ?? null,
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? null,
    query: row.query,
    rating: row.rating,
    response: row.response,
    reviewNote: null,
    reviewStatus: row.review_status,
    reviewTags: [],
    reviewedAt: row.reviewed_at ? dateValue(row.reviewed_at).toISOString() : null,
    reviewedBy: row.reviewed_by ?? null,
    runId: row.run_id ?? null,
    sessionId: row.session_id ?? null,
    tags: jsonArray(row.tags),
    templateId: row.prompt_template_id ?? null,
    timestamp: dateValue(row.timestamp).toISOString(),
    toolsUsed: jsonArray(row.tools_used),
    updatedAt: dateValue(row.timestamp).toISOString(),
    userId: row.user_id ?? null,
    version: row.version
  };
}

export function createExperimentInsert(record: JsonObject): ExperimentInsert {
  return {
    auto_generated: booleanValue(record.autoGenerated, false),
    baseline_version_id: stringValue(record.baselineVersionId),
    candidate_version_ids: jsonArray(record.candidateVersionIds),
    completed_at: nullableDate(record.completedAt),
    created_at: dateValue(record.createdAt),
    created_by: stringValue(record.createdBy) || "system",
    description: stringValue(record.description),
    error_message: nullableString(record.errorMessage),
    evaluation_config: jsonObject(record.evaluationConfig),
    id: stringValue(record.id) || createRunId("prompt_experiment"),
    judge_model: nullableString(record.judgeModel),
    model: nullableString(record.model),
    name: stringValue(record.name),
    repetitions: Math.max(1, Math.trunc(numberValue(record.repetitions, 1))),
    started_at: nullableDate(record.startedAt),
    status: stringValue(record.status) || "PENDING",
    temperature: numberValue(record.temperature, 0.3),
    template_id: stringValue(record.templateId),
    test_queries: jsonArray(record.testQueries)
  };
}

export function mapExperimentRow(row: ExperimentRow | ExperimentInsert): JsonObject {
  const createdAt = dateValue(row.created_at).toISOString();
  const startedAt = row.started_at ? dateValue(row.started_at).toISOString() : null;
  const completedAt = row.completed_at ? dateValue(row.completed_at).toISOString() : null;

  return {
    autoGenerated: row.auto_generated,
    baselineVersionId: row.baseline_version_id,
    candidateVersionIds: jsonArray(row.candidate_version_ids),
    completedAt,
    createdAt,
    createdBy: row.created_by,
    description: row.description,
    errorMessage: row.error_message ?? null,
    evaluationConfig: jsonObject(row.evaluation_config),
    id: row.id,
    judgeModel: row.judge_model ?? null,
    model: row.model ?? null,
    name: row.name,
    repetitions: row.repetitions,
    startedAt,
    status: row.status,
    templateId: row.template_id,
    temperature: row.temperature,
    testQueries: jsonArray(row.test_queries),
    updatedAt: completedAt ?? startedAt ?? createdAt
  };
}

export function createTrialInsert(experimentId: string, record: JsonObject): TrialInsert {
  return {
    duration_ms: Math.max(0, Math.trunc(numberValue(record.durationMs, 0))),
    error_message: nullableString(record.errorMessage),
    evaluations: jsonArray(record.evaluations),
    executed_at: dateValue(record.executedAt),
    experiment_id: experimentId,
    id: stringValue(record.id) || createRunId("prompt_trial"),
    prompt_version_id: stringValue(record.promptVersionId),
    prompt_version_number: Math.trunc(numberValue(record.promptVersionNumber, 1)),
    repetition_index: Math.trunc(numberValue(record.repetitionIndex, 0)),
    response: nullableString(record.response),
    success: booleanValue(record.success, false),
    test_query: stringValue(record.query),
    token_usage: jsonObject(record.tokenUsage),
    tools_used: jsonArray(record.toolsUsed)
  };
}

export function mapTrialRow(row: TrialRow | TrialInsert): JsonObject {
  return {
    durationMs: numberValue(row.duration_ms, 0),
    errorMessage: row.error_message ?? null,
    evaluations: jsonArray(row.evaluations),
    executedAt: dateValue(row.executed_at).toISOString(),
    experimentId: row.experiment_id,
    id: row.id,
    promptVersionId: row.prompt_version_id,
    promptVersionNumber: row.prompt_version_number,
    query: row.test_query,
    repetitionIndex: row.repetition_index,
    response: row.response ?? null,
    success: row.success,
    tokenUsage: jsonObject(row.token_usage),
    toolsUsed: jsonArray(row.tools_used)
  };
}

export function createExperimentReportInsert(experimentId: string, report: JsonObject): ExperimentReportInsert {
  return {
    created_at: dateValue(report.generatedAt ?? report.createdAt),
    experiment_id: experimentId,
    report_data: {
      ...report,
      experimentId,
      id: stringValue(report.id) || experimentId
    }
  };
}

export function mapExperimentReportRow(row: ExperimentReportRow | ExperimentReportInsert): JsonObject {
  const report = jsonObject(row.report_data);
  return {
    ...report,
    createdAt: dateValue(row.created_at).toISOString(),
    experimentId: row.experiment_id,
    id: stringValue(report.id) || row.experiment_id
  };
}

export function createPersonaInsert(record: JsonObject): PersonaInsert {
  const now = dateValue(record.updatedAt ?? record.createdAt);
  return {
    created_at: dateValue(record.createdAt),
    id: stringValue(record.id) || createRunId("persona"),
    identity: nullableString(record.identity ?? record.description ?? record.responseGuideline ?? record.welcomeMessage),
    is_default: booleanValue(record.isDefault, false),
    name: stringValue(record.name),
    prompt_template_id: nullableString(record.promptTemplateId),
    system_prompt: stringValue(record.systemPrompt),
    updated_at: now
  };
}

export function mapPersonaRow(row: PersonaRow | PersonaInsert, source: JsonObject = {}): JsonObject {
  const createdAt = dateValue(row.created_at).toISOString();
  const updatedAt = dateValue(row.updated_at).toISOString();
  return {
    description: nullableString(source.description ?? row.identity),
    icon: nullableString(source.icon),
    id: row.id,
    isActive: booleanValue(source.isActive, true),
    isDefault: row.is_default,
    name: row.name,
    promptTemplateId: row.prompt_template_id ?? null,
    responseGuideline: nullableString(source.responseGuideline),
    systemPrompt: row.system_prompt,
    welcomeMessage: nullableString(source.welcomeMessage),
    createdAt,
    updatedAt
  };
}

export function createPromptTemplateInsert(record: JsonObject): PromptTemplateInsert {
  return {
    created_at: dateValue(record.createdAt),
    description: stringValue(record.description),
    id: stringValue(record.id) || createRunId("prompt_template"),
    name: stringValue(record.name),
    updated_at: dateValue(record.updatedAt ?? record.createdAt)
  };
}

export function mapPromptTemplateRow(row: PromptTemplateRow | PromptTemplateInsert): JsonObject {
  const createdAt = dateValue(row.created_at).toISOString();
  return {
    createdAt,
    description: row.description,
    id: row.id,
    name: row.name,
    updatedAt: dateValue(row.updated_at).toISOString()
  };
}

export function createPromptVersionInsert(templateId: string, record: JsonObject): PromptVersionInsert {
  return {
    change_log: stringValue(record.changeLog),
    content: stringValue(record.content),
    created_at: dateValue(record.createdAt),
    id: stringValue(record.id) || createRunId("prompt_version"),
    status: stringValue(record.status) || "DRAFT",
    template_id: templateId,
    version: Math.max(1, Math.trunc(numberValue(record.version, 1)))
  };
}

export function mapPromptVersionRow(row: PromptVersionRow | PromptVersionInsert): JsonObject {
  return {
    changeLog: row.change_log,
    content: row.content,
    createdAt: dateValue(row.created_at).toISOString(),
    id: row.id,
    status: row.status,
    templateId: row.template_id,
    version: row.version
  };
}

export function createIntentDefinitionInsert(record: JsonObject): IntentDefinitionInsert {
  const name = stringValue(record.name) || stringValue(record.id);
  return {
    created_at: dateValue(record.createdAt),
    description: stringValue(record.description),
    enabled: booleanValue(record.enabled, true),
    examples: jsonArray(record.examples),
    keywords: jsonArray(record.keywords),
    name,
    profile: jsonObject(record.profile),
    updated_at: dateValue(record.updatedAt ?? record.createdAt)
  };
}

export function mapIntentDefinitionRow(row: IntentDefinitionRow | IntentDefinitionInsert): JsonObject {
  const createdAt = dateValue(row.created_at).toISOString();
  return {
    createdAt,
    description: row.description,
    enabled: row.enabled,
    examples: jsonArray(row.examples),
    id: row.name,
    keywords: jsonArray(row.keywords),
    name: row.name,
    profile: jsonObject(row.profile),
    updatedAt: dateValue(row.updated_at).toISOString()
  };
}

export interface PromptExperimentRunnerOptions {
  readonly provider: ModelProvider;
  readonly model?: string;
  readonly judge?: (testCase: EvalCase, response: ModelResponse) => EvalJudgeResult | Promise<EvalJudgeResult>;
}

export class PromptExperimentRunner {
  constructor(private readonly options: PromptExperimentRunnerOptions) {}

  async run(experiment: PromptExperiment): Promise<readonly PromptExperimentResult[]> {
    const results: PromptExperimentResult[] = [];
    const model = this.options.model ?? experiment.model;

    for (const variant of experiment.variants) {
      for (const testCase of experiment.cases) {
        const response = await this.options.provider.generate({
          messages: applySystemPrompt(testCase.input, variant.systemPrompt),
          metadata: {
            ...experiment.metadata,
            caseId: testCase.id,
            experimentId: experiment.id,
            variantId: variant.id
          },
          model
        });
        const judge = this.options.judge ? await this.options.judge(testCase, response) : undefined;
        results.push({
          caseId: testCase.id,
          experimentId: experiment.id,
          judge,
          response,
          variantId: variant.id
        });
      }
    }

    return results;
  }
}

export function createPromptVariant(input: Omit<PromptVariant, "id" | "metadata"> & {
  readonly id?: string;
  readonly metadata?: JsonObject;
}): PromptVariant {
  return {
    id: input.id ?? createRunId("prompt_variant"),
    metadata: input.metadata ?? {},
    name: input.name,
    systemPrompt: input.systemPrompt
  };
}

export function createPromptExperiment(input: Omit<PromptExperiment, "id" | "metadata"> & {
  readonly id?: string;
  readonly metadata?: JsonObject;
}): PromptExperiment {
  return {
    cases: input.cases,
    id: input.id ?? createRunId("prompt_experiment"),
    metadata: input.metadata ?? {},
    model: input.model,
    name: input.name,
    variants: input.variants
  };
}

export function rankPromptVariants(results: readonly PromptExperimentResult[]): readonly {
  readonly averageScore: number;
  readonly total: number;
  readonly variantId: string;
}[] {
  const grouped = new Map<string, number[]>();

  for (const result of results) {
    const scores = grouped.get(result.variantId) ?? [];
    scores.push(result.judge?.score ?? 0);
    grouped.set(result.variantId, scores);
  }

  return [...grouped.entries()]
    .map(([variantId, scores]) => ({
      averageScore: scores.reduce((total, score) => total + score, 0) / scores.length,
      total: scores.length,
      variantId
    }))
    .sort((left, right) => right.averageScore - left.averageScore);
}

export function applySystemPrompt(messages: readonly ModelMessage[], systemPrompt: string): readonly ModelMessage[] {
  const [first, ...rest] = messages;

  if (first?.role === "system") {
    return [{ ...first, content: `${systemPrompt}\n\n${first.content}` }, ...rest];
  }

  return [{ content: systemPrompt, role: "system" }, ...messages];
}

function withRecordIdentity(record: JsonObject, prefix: string): JsonObject & { readonly id: string } {
  const createdAt = dateValue(record.createdAt).toISOString();
  return {
    ...record,
    createdAt,
    id: stringValue(record.id) || createRunId(prefix),
    updatedAt: dateValue(record.updatedAt ?? createdAt).toISOString()
  };
}

function promptVersionRecords(record: JsonObject): JsonObject[] {
  return Array.isArray(record.versions)
    ? record.versions.filter((item): item is JsonObject =>
      isJsonValue(item) && Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function nullableNumber(value: unknown): number | null {
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function dateValue(value: unknown): Date {
  return value instanceof Date ? value : new Date(typeof value === "string" ? value : Date.now());
}

function nullableDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return new Date(value);
  }

  return null;
}

function jsonArray(value: unknown): JsonValue[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonValue);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return jsonArray(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function jsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)) {
    return value as JsonObject;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return jsonObject(parsed);
    } catch {
      return {};
    }
  }

  return {};
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}
