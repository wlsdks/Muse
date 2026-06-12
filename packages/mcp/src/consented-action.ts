/**
 * The act-as-the-user gate (P5-b3): a standing objective may only
 * perform an external action with the user's scoped service
 * credential when the user has RECORDED consent for that exact
 * {objective, scope}. Fail-closed and deterministic — no consent
 * record ⇒ no HTTP call, ever. Security is code here, not a prompt.
 *
 * Transport is injected (`fetchImpl`) so the action is exercised
 * over a real provider request shape with only the HTTP boundary
 * faked — never a fake "did the thing" flag.
 */

import { hasConsent } from "./personal-consent-store.js";
import { hasVeto } from "./personal-veto-store.js";

export interface ConsentedActionRequest {
  readonly url: string;
  readonly method?: string;
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

export interface PerformConsentedActionOptions {
  readonly consentFile: string;
  readonly userId: string;
  readonly objectiveId: string;
  readonly scope: string;
  /** The user's scoped service token — only sent when consent holds. */
  readonly credential: string;
  readonly request: ConsentedActionRequest;
  readonly fetchImpl: typeof fetch;
  /**
   * Optional veto store. When set and a veto matches
   * {userId, objectiveId, scope}, the action is refused BEFORE the
   * consent check — a recorded veto overrides any prior consent
   * ("don't do this again" wins). Absent ⇒ consent-only gating.
   */
  readonly vetoFile?: string;
  /**
   * Hard wall-clock cap on the HTTP call once consent has passed.
   * Default 30_000ms. A consented endpoint that hangs (network
   * partition, misbehaving upstream, sock leak) must not be able to
   * stall the standing-objective loop indefinitely; on timeout the
   * outcome is `{ performed: false, reason: "consented action timed
   * out…" }` so the loop's next-tick cadence stays bounded.
   */
  readonly timeoutMs?: number;
}

const DEFAULT_CONSENTED_ACTION_TIMEOUT_MS = 30_000;

export type ConsentedActionOutcome =
  | { readonly performed: false; readonly reason: string }
  | { readonly performed: true; readonly status: number };

export async function performConsentedAction(
  options: PerformConsentedActionOptions
): Promise<ConsentedActionOutcome> {
  if (options.vetoFile) {
    const vetoed = await hasVeto(options.vetoFile, {
      objectiveId: options.objectiveId,
      scope: options.scope,
      userId: options.userId
    });
    if (vetoed) {
      // A veto overrides prior consent — checked first, fail-closed.
      return { performed: false, reason: `vetoed: action class ${options.scope} for objective ${options.objectiveId}` };
    }
  }

  const consented = await hasConsent(options.consentFile, {
    objectiveId: options.objectiveId,
    scope: options.scope,
    userId: options.userId
  });
  if (!consented) {
    // Fail-closed: no recorded consent ⇒ the credential is never
    // resolved, no request is ever made.
    return { performed: false, reason: `no recorded consent for scope ${options.scope}` };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_CONSENTED_ACTION_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  // Strip any caller-supplied authorization header (case-insensitively) so the
  // consent-gated credential is the ONLY Bearer token that ever leaves — a
  // request.headers spread must never override or corrupt the code-owned token.
  const callerHeaders = Object.fromEntries(
    Object.entries(options.request.headers ?? {}).filter(([key]) => key.toLowerCase() !== "authorization")
  );
  try {
    response = await options.fetchImpl(options.request.url, {
      body: options.request.body,
      headers: {
        authorization: `Bearer ${options.credential}`,
        ...(options.request.body ? { "content-type": "application/json" } : {}),
        ...callerHeaders
      },
      method: options.request.method ?? "POST",
      signal: controller.signal
    });
  } catch (cause) {
    const aborted = controller.signal.aborted;
    return aborted
      ? { performed: false, reason: `consented action timed out after ${timeoutMs.toString()}ms` }
      : { performed: false, reason: `consented action fetch failed: ${cause instanceof Error ? cause.message : String(cause)}` };
  } finally {
    clearTimeout(timer);
  }
  return { performed: true, status: response.status };
}
