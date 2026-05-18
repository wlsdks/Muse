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
}

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

  const response = await options.fetchImpl(options.request.url, {
    body: options.request.body,
    headers: {
      authorization: `Bearer ${options.credential}`,
      ...(options.request.body ? { "content-type": "application/json" } : {}),
      ...options.request.headers
    },
    method: options.request.method ?? "POST"
  });
  return { performed: true, status: response.status };
}
