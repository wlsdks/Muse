/**
 * Reactor-compat model registry helpers extracted from
 * reactor-compat-routes.ts. Covers /api/sessions/models (the dropdown
 * source for the chat surface) and /api/admin/models (the priced
 * registry the admin platform shows). Plus the agent-mode normalizers
 * (parseAgentMode, agentModeResponse).
 */

import type { AgentSpecInput } from "@muse/agent-specs";
import type { ReactorCompatibilityRouteOptions } from "./reactor-compat-routes.js";

export async function listSessionModels(options: ReactorCompatibilityRouteOptions) {
  const models = await options.modelProvider?.listModels();
  const names = models && models.length > 0
    ? models.map((model) => `${model.providerId}/${model.modelId}`)
    : options.defaultModel ? [options.defaultModel] : [];
  const defaultModel = options.defaultModel ?? names[0] ?? "";

  return {
    defaultModel,
    models: names.map((name) => ({ isDefault: name === defaultModel, name }))
  };
}

export function listAdminModelRegistry(options: ReactorCompatibilityRouteOptions) {
  const defaultModel = options.defaultModel ?? "";
  const pricing = [
    { input: 0.15, name: "gemini-3-flash-preview", output: 0.6 },
    { input: 0.15, name: "gemini-3-flash", output: 0.6 },
    { input: 1.25, name: "gemini-3-pro-preview", output: 10 },
    { input: 1.25, name: "gemini-3-pro", output: 10 },
    { input: 0.15, name: "gemini-2.5-flash", output: 0.6 },
    { input: 1.25, name: "gemini-2.5-pro", output: 10 },
    { input: 2.5, name: "gpt-4o", output: 10 },
    { input: 0.15, name: "gpt-4o-mini", output: 0.6 },
    { input: 3, name: "claude-sonnet-4-20250514", output: 15 },
    { input: 15, name: "claude-opus-4-20250514", output: 75 }
  ];

  return pricing.map((model) => ({
    inputPricePerMillionTokens: model.input,
    isDefault: model.name === defaultModel,
    name: model.name,
    outputPricePerMillionTokens: model.output
  }));
}

export function parseAgentMode(value: unknown): AgentSpecInput["mode"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "standard" || normalized === "plan_execute" || normalized === "react" ? normalized : undefined;
}

export function agentModeResponse(value: AgentSpecInput["mode"]): string {
  return value === "plan_execute" ? "PLAN_EXECUTE" : (value ?? "react").toUpperCase();
}
