/**
 * Conversational actuation: expose the gated Home Assistant
 * smart-home control as an AGENT tool so Muse can act on "turn off the
 * living-room lights" mid-turn — not only via `muse home call`.
 * Execution routes through the proven fail-closed
 * `performHomeActionWithApproval` (approval gate, action-logged), so
 * the agent path inherits the SAME guarantee: deny / absent confirm ⇒
 * no service call. Opt-in via the host base URL + long-lived token.
 */

import type { JsonObject } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

import { listHomeAssistantStatesDetailed, performHomeActionWithApproval, readHomeAssistantStateDetailed, type HomeAssistantReadFailure } from "./smart-home.js";
import type { RetryOptions } from "@muse/mcp-shared";
import type { WebActionApprovalGate } from "./web-action.js";

/**
 * Render a Home Assistant read failure as a message that tells the model
 * WHY nothing came back — a dead host, a bad token, and a genuinely
 * unknown entity are different facts and need different next steps.
 */
function describeHomeAssistantFailure(failure: HomeAssistantReadFailure, entityId?: string): string {
  switch (failure.kind) {
    case "local-only":
      return failure.reason;
    case "unreachable":
      return `Home Assistant unreachable at ${failure.baseUrl} — check MUSE_HOMEASSISTANT_URL / that HA is running`;
    case "unauthorized":
      return `Home Assistant rejected the token (HTTP ${failure.status.toString()}) — refresh MUSE_HOMEASSISTANT_TOKEN`;
    case "not-found":
      return entityId
        ? `no entity '${entityId}' — ids look like '<domain>.<name>', e.g. 'lock.front_door'; call home_entities to list them`
        : "no matching entity";
    case "http-error":
      return `Home Assistant responded HTTP ${failure.status.toString()} — check MUSE_HOMEASSISTANT_URL / MUSE_HOMEASSISTANT_TOKEN`;
    case "malformed":
      return "Home Assistant returned an unexpected response — check MUSE_HOMEASSISTANT_URL points at a real Home Assistant instance";
  }
}

/**
 * Accept a plain string, or the single-element string array a small model
 * emits for what should be a scalar filter — a `[light]` form must not be
 * silently dropped into "no filter" (which would then return an
 * unfiltered, full-house list with no disclosure that the filter was lost).
 * Any other shape is rejected outright.
 */
function coerceStringFilter(value: unknown): { readonly ok: true; readonly value: string | undefined } | { readonly ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === "string") return { ok: true, value: value.trim() };
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") return { ok: true, value: value[0].trim() };
  return { ok: false };
}

const HOME_ENTITIES_PAGE_SIZE = 50;

export interface HomeActionToolDeps {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetchImpl: typeof fetch;
  readonly approvalGate: WebActionApprovalGate;
  readonly actionLogFile: string;
  readonly userId: string;
  /** Composition-owned local-only posture; false never overrides ambient strictness. */
  readonly localOnly?: boolean;
}

export function createHomeActionTool(deps: HomeActionToolDeps): MuseTool {
  return {
    definition: {
      description:
        "Call a Home Assistant service to control a smart-home device (lights, locks, climate/thermostat, fans), OR activate a scene / run a script (a 'routine'). "
        + "Examples: turn a light off — service 'light.turn_off', entity 'light.living_room'; "
        + "set the thermostat to a temperature — service 'climate.set_temperature', entity 'climate.living_room'; "
        + "activate a scene ('movie mode') — service 'scene.turn_on', entity 'scene.movie_mode'; "
        + "run a routine ('good night') — service 'script.turn_on', entity 'script.good_night'. "
        + "The user must confirm the exact action before it fires; absent confirmation nothing happens. Not for payments.",
      domain: "home",
      inputSchema: {
        additionalProperties: false,
        properties: {
          data: { description: "Extra service data (object), merged into the call body.", type: "object" },
          entity: { description: "Target entity_id, e.g. 'light.living_room', 'scene.movie_mode', or 'script.good_night'.", type: "string" },
          service: { description: "Service id as '<domain>.<service>', e.g. 'light.turn_off', 'scene.turn_on', 'script.turn_on'.", type: "string" }
        },
        required: ["service"],
        type: "object"
      },
      keywords: ["home", "smart-home", "light", "lock", "device", "homeassistant", "scene", "scenes", "script", "routine", "activate", "불", "조명", "켜", "꺼", "잠가", "열어", "온도", "에어컨", "보일러"],
      name: "home_action",
      risk: "execute"
    },
    execute: async (args): Promise<JsonObject> => {
      const service = typeof args["service"] === "string" ? args["service"].trim() : "";
      const dot = service.indexOf(".");
      if (dot <= 0 || dot === service.length - 1) {
        return { performed: false, reason: `service must be '<domain>.<service>' (e.g. light.turn_off), got '${service}'` };
      }
      const entityId = typeof args["entity"] === "string" ? args["entity"].trim() : undefined;
      const data = args["data"] && typeof args["data"] === "object" && !Array.isArray(args["data"])
        ? args["data"] as Record<string, unknown>
        : undefined;
      // A service call with NO resolved target is Home Assistant's "apply to
      // EVERY entity in the domain" path: a model emitting `light.turn_off` with
      // no entity would turn off the whole house, `lock.unlock` would unlock
      // every lock — and the approval summary shows no target, so the user
      // isn't warned. Fail closed unless an entity arg OR a target key in `data`
      // (entity_id / area_id / device_id / target) resolves a concrete scope.
      // A target key must resolve a CONCRETE scope — an EMPTY one (`target: {}`,
      // `entity_id: []` / `""`) is no target: Home Assistant treats it as the
      // whole-domain path, so a mere key-presence check would let an empty target
      // bypass this fail-close and blast every device.
      const isConcreteTarget = (value: unknown): boolean =>
        (typeof value === "string" && value.trim().length > 0) || (Array.isArray(value) && value.length > 0);
      const nested = data && typeof data["target"] === "object" && data["target"] !== null && !Array.isArray(data["target"])
        ? data["target"] as Record<string, unknown>
        : undefined;
      const dataHasTarget = data !== undefined
        && (isConcreteTarget(data["entity_id"]) || isConcreteTarget(data["area_id"]) || isConcreteTarget(data["device_id"])
          || (nested !== undefined && (isConcreteTarget(nested["entity_id"]) || isConcreteTarget(nested["area_id"]) || isConcreteTarget(nested["device_id"]))));
      if (!entityId && !dataHasTarget) {
        return {
          performed: false,
          reason: `home_action needs a target — pass entity (e.g. 'light.living_room'). Refusing '${service}' with no entity: with no target it would hit EVERY device in the '${service.slice(0, dot)}' domain.`
        };
      }
      const outcome = await performHomeActionWithApproval({
        actionLogFile: deps.actionLogFile,
        approvalGate: deps.approvalGate,
        baseUrl: deps.baseUrl,
        domain: service.slice(0, dot),
        fetchImpl: deps.fetchImpl,
        service: service.slice(dot + 1),
        token: deps.token,
        userId: deps.userId,
        ...(deps.localOnly ? { localOnly: true } : {}),
        ...(entityId ? { entityId } : {}),
        ...(data ? { data } : {})
      });
      return outcome.performed
        ? { performed: true, status: outcome.status }
        : { detail: outcome.detail, performed: false, reason: outcome.reason };
    }
  };
}

export interface HomeStateToolDeps {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
  readonly retryOptions?: RetryOptions;
  /** Composition-owned local-only posture; false never overrides ambient strictness. */
  readonly localOnly?: boolean;
}

export function createHomeStateTool(deps: HomeStateToolDeps): MuseTool {
  return {
    definition: {
      description:
        "Read the current state of a Home Assistant entity, e.g. is 'lock.front_door' locked, or the temperature of 'sensor.living_room'. Read-only — never changes anything.",
      domain: "home",
      inputSchema: {
        additionalProperties: false,
        properties: {
          entity: { description: "Target entity_id, e.g. 'lock.front_door' or 'sensor.living_room_temperature'.", type: "string" }
        },
        required: ["entity"],
        type: "object"
      },
      keywords: ["home", "smart-home", "state", "status", "temperature", "lock", "sensor", "homeassistant", "불", "조명", "온도", "습도", "센서", "상태", "켜져", "꺼져"],
      name: "home_state",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const entityId = typeof args["entity"] === "string" ? args["entity"].trim() : "";
      if (entityId.length === 0) {
        return { found: false, reason: "entity is required (e.g. lock.front_door)" };
      }
      const result = await readHomeAssistantStateDetailed({
        baseUrl: deps.baseUrl,
        entityId,
        token: deps.token,
        ...(deps.localOnly ? { localOnly: true } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.retryOptions ? { retryOptions: deps.retryOptions } : {})
      });
      if (!result.ok) {
        return { entity: entityId, found: false, reason: describeHomeAssistantFailure(result, entityId) };
      }
      return { attributes: result.state.attributes as JsonObject, entity: result.state.entityId, found: true, state: result.state.state };
    }
  };
}

export function createHomeEntitiesTool(deps: HomeStateToolDeps): MuseTool {
  return {
    definition: {
      description:
        "List the user's Home Assistant entities (id + current state) to discover what devices exist and find the exact entity_id for home_state / home_action. Read-only. Optionally filter to one `domain` ('light'/'lock'/'sensor') AND/OR a `state` — pass `state` to answer 'what lights are ON?' ('light'+'on') or 'is anything unlocked / left open?' ('unlocked'/'open').",
      domain: "home",
      inputSchema: {
        additionalProperties: false,
        properties: {
          domain: { description: "Optional device type to filter to, e.g. 'light', 'lock', 'sensor' (omit for all).", type: "string" },
          offset: { description: "Pagination offset — skip this many matching entities before returning the page, e.g. 50 for the second page. Defaults to 0.", minimum: 0, type: "integer" },
          state: { description: "Optional current-state filter (case-insensitive), e.g. 'on', 'unlocked', 'open' — returns only entities in that state.", type: "string" }
        },
        type: "object"
      },
      keywords: ["home", "smart-home", "devices", "entities", "list", "discover", "on", "off", "unlocked", "open", "homeassistant", "기기", "장치", "목록", "스마트홈"],
      name: "home_entities",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const domainCoerced = coerceStringFilter(args["domain"]);
      if (!domainCoerced.ok) {
        return { count: 0, entities: [], error: "domain must be a string entity domain, e.g. 'light' or 'lock'" };
      }
      const stateCoerced = coerceStringFilter(args["state"]);
      if (!stateCoerced.ok) {
        return { count: 0, entities: [], error: "state must be a string entity state, e.g. 'on' or 'unlocked'" };
      }
      const domain = domainCoerced.value && domainCoerced.value.length > 0 ? domainCoerced.value : undefined;
      const stateFilter = stateCoerced.value && stateCoerced.value.length > 0 ? stateCoerced.value.toLowerCase() : undefined;
      const rawOffset = args["offset"];
      const offset = typeof rawOffset === "number" && Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.trunc(rawOffset) : 0;
      const result = await listHomeAssistantStatesDetailed({
        baseUrl: deps.baseUrl,
        token: deps.token,
        ...(deps.localOnly ? { localOnly: true } : {}),
        ...(domain ? { domain } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.retryOptions ? { retryOptions: deps.retryOptions } : {})
      });
      if (!result.ok) {
        return { count: 0, entities: [], error: describeHomeAssistantFailure(result) };
      }
      const filtered = stateFilter
        ? result.states.filter((e) => e.state.toLowerCase() === stateFilter)
        : result.states;
      const page = filtered.slice(offset, offset + HOME_ENTITIES_PAGE_SIZE);
      const hasMore = offset + page.length < filtered.length;
      return {
        count: page.length,
        entities: page.map((e) => ({ entity: e.entityId, state: e.state })) as JsonObject[],
        hasMore,
        total: filtered.length,
        ...(hasMore ? { nextOffset: offset + page.length } : {}),
        ...(domain ? { domain } : {}),
        ...(stateFilter ? { state: stateFilter } : {})
      };
    }
  };
}
