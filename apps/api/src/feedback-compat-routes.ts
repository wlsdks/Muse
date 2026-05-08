/**
 * Reactor-compat feedback routes extracted from reactor-compat-routes.ts.
 *
 * Wires the public `/api/feedback` POST + the admin GET list / stats /
 * unreviewed-count / export / bulk-update / item GET / PATCH (with If-Match
 * version conflict) / DELETE so the call site in
 * registerReactorCompatibilityRoutes doesn't change.
 */

import type { FastifyInstance } from "fastify";
import {
  createFeedback,
  deleteFeedback,
  errorResponse,
  feedbackStats,
  filterFeedback,
  getFeedback,
  isUnreviewedNegativeFeedback,
  listFeedback,
  nowIso,
  parseFeedbackRating,
  parseFeedbackReviewStatus,
  readAuthUserId,
  readIfMatchVersion,
  readNumber,
  readQueryInstantMillis,
  readQueryInteger,
  readQueryString,
  stringArrayField,
  toBody,
  toFeedbackExportItem,
  toFeedbackResponse,
  updateFeedbackReview,
  validateFeedbackReviewBody,
  validateFeedbackSubmitBody,
  validationErrorResponse,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerFeedbackCompatRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.post("/api/feedback", async (request, reply) => {
    const body = toBody(request.body);
    const rating = parseFeedbackRating(body.rating);

    if (!rating) {
      return reply.status(400).send(errorResponse("잘못된 요청입니다"));
    }

    const validationError = validateFeedbackSubmitBody(body);

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    return reply.status(201).send(toFeedbackResponse(await createFeedback(request, options)));
  });
  server.get("/api/feedback", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const q = readQueryString(request, "q");
    const rating = readQueryString(request, "rating");
    const status = readQueryString(request, "status");

    if (q && q.trim().length > 0 && q.trim().length < 2) {
      return reply.status(400).send(errorResponse("q는 최소 2자 이상이어야 합니다"));
    }

    if (rating && !parseFeedbackRating(rating)) {
      return reply.status(400).send(errorResponse("잘못된 요청입니다"));
    }

    if (status && !parseFeedbackReviewStatus(status)) {
      return reply.status(400).send(errorResponse("잘못된 요청입니다"));
    }

    for (const key of ["from", "to"]) {
      const raw = readQueryString(request, key);

      if (raw && readQueryInstantMillis(request, key) === undefined) {
        return reply.status(400).send(errorResponse("잘못된 요청입니다"));
      }
    }

    const items = (await filterFeedback(request, options)).map(toFeedbackResponse);
    const limit = readQueryInteger(request, "limit", 50);
    return {
      approximateTotal: items.length,
      items: items.slice(0, Math.max(1, Math.min(limit, 100))),
      nextCursor: null,
      prevCursor: null
    };
  });
  server.get("/api/feedback/stats", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return feedbackStats(await listFeedback(options));
  });
  server.get("/api/feedback/unreviewed-count", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return { count: (await listFeedback(options)).filter(isUnreviewedNegativeFeedback).length };
  });
  server.get("/api/feedback/export", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return {
      exportedAt: nowIso(),
      items: (await listFeedback(options)).map(toFeedbackExportItem),
      source: "reactor",
      version: 1
    };
  });
  server.post("/api/feedback/bulk-update", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const body = toBody(request.body);
    const ids = stringArrayField(body.ids, []);
    const updated: string[] = [];
    const failed: { readonly id: string; readonly reason: string }[] = [];

    if (ids.length === 0) {
      return reply.status(400).send(errorResponse("요청 형식이 올바르지 않습니다"));
    }

    if (ids.length > 100) {
      return reply.status(422).send({ error: "too_many_ids", max: 100 });
    }

    if (typeof body.status === "string" && !parseFeedbackReviewStatus(body.status)) {
      return reply.status(400).send(errorResponse("잘못된 요청입니다"));
    }

    const validationError = validateFeedbackReviewBody(body);

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    for (const id of ids) {
      const existing = await getFeedback(options, id);

      if (!existing) {
        failed.push({ id, reason: "not_found" });
        continue;
      }

      await updateFeedbackReview(existing, body, readAuthUserId(request) ?? "admin", options);
      updated.push(existing.id);
    }

    return { failed, updated };
  });
  server.get("/api/feedback/:feedbackId", async (request, reply) => {
    const { feedbackId } = request.params as { readonly feedbackId: string };
    const feedback = await getFeedback(options, feedbackId);
    return feedback
      ? toFeedbackResponse(feedback)
      : reply.status(404).send(errorResponse(`Feedback not found: ${feedbackId}`));
  });
  server.patch("/api/feedback/:feedbackId", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { feedbackId } = request.params as { readonly feedbackId: string };
    const feedback = await getFeedback(options, feedbackId);

    if (!feedback) {
      return reply.status(404).send(errorResponse(`Feedback not found: ${feedbackId}`));
    }

    const expectedVersion = readIfMatchVersion(request);

    if (expectedVersion === undefined) {
      return reply.status(400).send(errorResponse("If-Match 헤더가 필수입니다 (current version)"));
    }

    const currentVersion = readNumber(feedback.version, 1);

    if (expectedVersion !== currentVersion) {
      return reply.status(409).send({
        current: toFeedbackResponse(feedback),
        error: "version_conflict",
        expectedVersion
      });
    }

    const body = toBody(request.body);

    if (typeof body.status === "string" && !parseFeedbackReviewStatus(body.status)) {
      return reply.status(400).send(errorResponse("잘못된 요청입니다"));
    }

    const validationError = validateFeedbackReviewBody(body);

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    return toFeedbackResponse(await updateFeedbackReview(feedback, body, readAuthUserId(request) ?? "admin", options));
  });
  server.delete("/api/feedback/:feedbackId", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { feedbackId } = request.params as { readonly feedbackId: string };
    await deleteFeedback(options, feedbackId);

    return reply.status(204).send();
  });
}
