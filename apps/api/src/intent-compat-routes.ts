/**
 * Reactor-compat intent routes extracted from reactor-compat-routes.ts.
 *
 * Wires `/api/intents` CRUD so the call site in
 * registerReactorCompatibilityRoutes doesn't change.
 */

import type { FastifyInstance } from "fastify";
import {
  createIntent,
  deleteIntent,
  errorResponse,
  getIntent,
  listIntents,
  readBodyString,
  toBody,
  toIntentResponse,
  updateIntent,
  validateIntentBody,
  validationErrorResponse,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerIntentRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/intents", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return (await listIntents(options)).map(toIntentResponse);
  });
  server.get("/api/intents/:intentName", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { intentName } = request.params as { readonly intentName: string };
    const intent = await getIntent(options, intentName);
    return intent ? toIntentResponse(intent) : reply.status(404).send(errorResponse(`Intent not found: ${intentName}`));
  });
  server.post("/api/intents", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const validationError = validateIntentBody(toBody(request.body), "create");

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    const name = readBodyString(request.body, "name") ?? "";

    if (await getIntent(options, name)) {
      return reply.status(409).send(errorResponse(`Intent '${name}' already exists`));
    }

    return reply.status(201).send(toIntentResponse(await createIntent(options, request.body)));
  });
  server.put("/api/intents/:intentName", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { intentName } = request.params as { readonly intentName: string };
    const existing = await getIntent(options, intentName);

    if (!existing) {
      return reply.status(404).send(errorResponse(`Intent not found: ${intentName}`));
    }

    const validationError = validateIntentBody(toBody(request.body), "update");

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    return toIntentResponse(await updateIntent(options, existing, request.body));
  });
  server.delete("/api/intents/:intentName", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { intentName } = request.params as { readonly intentName: string };
    await deleteIntent(options, intentName);

    return reply.status(204).send();
  });
}
