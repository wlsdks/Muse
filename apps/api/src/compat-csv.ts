/**
 * Pure CSV helpers used across the Muse compat admin export endpoints
 * (`/api/admin/audits/export`, `/api/admin/tenant/export/{executions,tools}`).
 *
 * Kept in their own module so they don't depend on the
 * CompatibilityRouteOptions surface.
 */

import type { AgentRunRecord, ToolCallRecord } from "@muse/runtime-state";

export function csvRows(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map((item) => csvEscape(String(item ?? ""))).join(","))
  ].join("\n");
}

export function runsCsv(runs: readonly AgentRunRecord[]): string {
  return csvRows(
    ["id", "created_at", "user_id", "model", "status", "cost_usd", "input", "output"],
    runs.map((run) => [
      run.id,
      run.createdAt.toISOString(),
      run.userId ?? "anonymous",
      run.model,
      run.status,
      run.costUsd,
      run.input,
      run.output ?? ""
    ])
  );
}

export function toolCallsCsv(toolCalls: readonly ToolCallRecord[]): string {
  return csvRows(
    ["id", "run_id", "created_at", "name", "risk", "status", "result", "error"],
    toolCalls.map((call) => [
      call.id,
      call.runId,
      call.createdAt.toISOString(),
      call.name,
      call.risk,
      call.status,
      call.result ?? "",
      call.error ?? ""
    ])
  );
}

function csvEscape(value: string): string {
  return value.includes(",") || value.includes("\"") || value.includes("\n")
    ? `"${value.replace(/"/g, "\"\"")}"`
    : value;
}
