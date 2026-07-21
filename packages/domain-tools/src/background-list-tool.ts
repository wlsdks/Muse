/**
 * `background_list` agent tool (X-3) — surface the long-running background
 * processes Muse has started (dev servers, `watch` builds, test runners) so a
 * conversation can answer "what's running in the background?" / "is my dev
 * server still up?". Read-only: it LISTS the registry, it never starts, stops,
 * or restarts a process (those are CLI-only `muse bg` actions, deliberately not
 * exposed to the model — a state-changing exec must stay user-initiated).
 */

import type { JsonObject } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

import type { BackgroundProcessRecord } from "@muse/stores";

const ALLOWED_STATUSES = new Set(["running", "exited", "failed", "killed"]);

export interface BackgroundListToolDeps {
  /** The background-process registry records (as written by `muse bg run`). */
  readonly processes: () => Promise<readonly BackgroundProcessRecord[]> | readonly BackgroundProcessRecord[];
}

export function createBackgroundListTool(deps: BackgroundListToolDeps): MuseTool {
  return {
    definition: {
      description:
        "List the background processes Muse is running — a dev server, watch build, or long task started with `muse bg run`. Shows id, command, status (running / exited / failed / killed), and exit code. Answers 'what's running in the background?' / 'is my dev server still up?' / '백그라운드에 뭐 돌고 있어?'. Read-only — it lists processes; it does NOT start, stop, or restart one (use the `muse bg` CLI for that). Do not use to run a command or for foreground shell work.",
      domain: "system",
      inputSchema: {
        additionalProperties: false,
        properties: {
          status: {
            description:
              "Filter by status: 'running' (still alive), 'exited' (finished 0), 'failed' (errored), or 'killed' (stopped). Omit to list all. e.g. 'what's still running?' → 'running'.",
            enum: ["running", "exited", "failed", "killed"],
            type: "string"
          }
        },
        required: [],
        type: "object"
      },
      keywords: ["background", "running", "process", "processes", "dev server", "watch", "백그라운드", "돌고", "프로세스", "서버"],
      name: "background_list",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const rawStatus = typeof args["status"] === "string" ? args["status"].trim() : undefined;
      let statusFilter: string | undefined;
      if (rawStatus !== undefined && rawStatus.length > 0) {
        const normalized = rawStatus.toLowerCase();
        if (!ALLOWED_STATUSES.has(normalized)) {
          return {
            count: 0,
            error: `unknown status filter '${rawStatus}' — use one of: running, exited, failed, killed (e.g. status:"running" for what is still alive)`,
            processes: []
          };
        }
        statusFilter = normalized;
      }
      const all = await deps.processes();
      const selected = statusFilter ? all.filter((record) => record.status === statusFilter) : all;
      return {
        count: selected.length,
        processes: selected.map((record) => ({
          command: record.command,
          id: record.id,
          status: record.status,
          ...(record.exitCode !== undefined && record.exitCode !== null ? { exitCode: record.exitCode } : {})
        }))
      };
    }
  };
}
