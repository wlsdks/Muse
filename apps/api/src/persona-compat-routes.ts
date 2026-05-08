/**
 * Reactor-compat persona routes extracted from reactor-compat-routes.ts.
 *
 * Wires `/api/personas` CRUD so the call site in
 * registerReactorCompatibilityRoutes doesn't change.
 */

import type { FastifyInstance } from "fastify";
import {
  createPersona,
  deletePersona,
  errorResponse,
  getPersona,
  listPersonas,
  readQueryBoolean,
  toBody,
  toPersonaResponse,
  updatePersona,
  validatePersonaBody,
  validationErrorResponse,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerPersonaRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/personas", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const activeOnly = readQueryBoolean(request, "activeOnly", false);
    const personas = (await listPersonas(options)).map(toPersonaResponse);
    return activeOnly ? personas.filter((persona) => persona.isActive) : personas;
  });
  server.get("/api/personas/:personaId", async (request, reply) => {
    const { personaId } = request.params as { readonly personaId: string };
    const persona = await getPersona(options, personaId);
    return persona ? toPersonaResponse(persona) : reply.status(404).send(errorResponse(`Persona not found: ${personaId}`));
  });
  server.post("/api/personas", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const validationError = validatePersonaBody(toBody(request.body), "create");

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    return reply.status(201).send(toPersonaResponse(await createPersona(options, request.body)));
  });
  server.put("/api/personas/:personaId", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { personaId } = request.params as { readonly personaId: string };
    const existing = await getPersona(options, personaId);

    if (!existing) {
      return reply.status(404).send(errorResponse(`Persona not found: ${personaId}`));
    }

    const validationError = validatePersonaBody(toBody(request.body), "update");

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    return toPersonaResponse(await updatePersona(options, existing, request.body));
  });
  server.delete("/api/personas/:personaId", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { personaId } = request.params as { readonly personaId: string };
    await deletePersona(options, personaId);

    return reply.status(204).send();
  });
}
