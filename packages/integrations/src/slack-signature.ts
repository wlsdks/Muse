/**
 * Slack + webhook HMAC signature primitives extracted from
 * packages/integrations/src/index.ts.
 *
 * Owns the public `signSlackRequestBody` / `verifySlackSignature`
 * pair (Slack v0 signature scheme), the webhook `signWebhookPayload`
 * / `verifyWebhookSignature` pair (sha256 = scheme), the
 * `SlackSignatureVerifier` class with timestamp-tolerance gate, and
 * the `createWebhookHeaders` helper that lifts a payload signature
 * onto an outbound request's `x-muse-signature` header.
 *
 * Re-exported from the integrations barrel for backwards compatibility.
 */

import type { JsonObject } from "@muse/shared";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  SlackSignatureVerificationResult,
  SlackSignatureVerifierOptions
} from "./index.js";

export class SlackSignatureVerifier {
  private readonly signingSecret: string;
  private readonly timestampToleranceSeconds: number;
  private readonly nowSeconds: () => number;

  constructor(options: SlackSignatureVerifierOptions) {
    this.signingSecret = options.signingSecret;
    this.timestampToleranceSeconds = options.timestampToleranceSeconds ?? 300;
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  verify(
    timestamp: string | undefined,
    signature: string | undefined,
    rawBody: string
  ): SlackSignatureVerificationResult {
    if (this.signingSecret.trim().length === 0) {
      return { ok: false, reason: "Signing secret is not configured" };
    }

    if (!timestamp || timestamp.trim().length === 0) {
      return { ok: false, reason: "Missing X-Slack-Request-Timestamp header" };
    }

    if (!signature || signature.trim().length === 0) {
      return { ok: false, reason: "Missing X-Slack-Signature header" };
    }

    const parsedTimestamp = Number.parseInt(timestamp, 10);

    if (!Number.isFinite(parsedTimestamp)) {
      return { ok: false, reason: "Invalid Slack request timestamp" };
    }

    if (Math.abs(this.nowSeconds() - parsedTimestamp) > this.timestampToleranceSeconds) {
      return { ok: false, reason: "Slack request timestamp is outside the allowed tolerance" };
    }

    return verifySlackSignature(rawBody, timestamp, signature, this.signingSecret)
      ? { ok: true }
      : { ok: false, reason: "Slack request signature mismatch" };
  }
}

export function signSlackRequestBody(rawBody: string, timestamp: string, secret: string): string {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
}

export function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const expected = Buffer.from(signSlackRequestBody(rawBody, timestamp, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signWebhookPayload(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function verifyWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) {
    return false;
  }

  const expected = Buffer.from(signWebhookPayload(payload, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createWebhookHeaders(body: JsonObject, secret: string | undefined): Record<string, string> {
  const serialized = JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (secret) {
    headers["x-muse-signature"] = signWebhookPayload(serialized, secret);
  }

  return headers;
}
