/**
 * Reactor-compat prompt-template routes extracted from reactor-compat-routes.ts.
 *
 * Wires `/api/prompt-templates` CRUD plus version create + activate/archive
 * lifecycle. The version-not-found 404 helper lives here too since it's
 * specific to this surface.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  appendPromptVersion,
  createPromptTemplate,
  deletePromptTemplate,
  errorResponse,
  getPromptTemplate,
  listPromptTemplates,
  readBodyString,
  savePromptTemplate,
  setPromptVersionStatus,
  toBody,
  toTemplateDetailResponse,
  toTemplateResponse,
  validatePromptTemplateBody,
  validatePromptVersionBody,
  validationErrorResponse,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerPromptTemplateRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/prompt-templates", async () => (await listPromptTemplates(options)).map(toTemplateResponse));
  server.get("/api/prompt-templates/:templateId", async (request, reply) => {
    const { templateId } = request.params as { readonly templateId: string };
    const template = await getPromptTemplate(options, templateId);
    return template
      ? toTemplateDetailResponse(template)
      : reply.status(404).send(errorResponse(`Prompt template not found: ${templateId}`));
  });
  server.post("/api/prompt-templates", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const validationError = validatePromptTemplateBody(toBody(request.body), "create");

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    return reply.status(201).send(toTemplateResponse(await createPromptTemplate(options, request.body)));
  });
  server.put("/api/prompt-templates/:templateId", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { templateId } = request.params as { readonly templateId: string };
    const existing = await getPromptTemplate(options, templateId);

    if (!existing) {
      return reply.status(404).send(errorResponse(`Prompt template not found: ${templateId}`));
    }

    const body = toBody(request.body);
    const validationError = validatePromptTemplateBody(body, "update");

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    const description = readBodyString(body, "description")
      ?? (typeof existing.description === "string" ? existing.description : "");
    const name = readBodyString(body, "name") ?? (typeof existing.name === "string" ? existing.name : "");
    const updated = await savePromptTemplate(options, {
      ...existing,
      description,
      name
    });
    return toTemplateResponse(updated);
  });
  server.delete("/api/prompt-templates/:templateId", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { templateId } = request.params as { readonly templateId: string };
    await deletePromptTemplate(options, templateId);
    return reply.status(204).send();
  });
  server.post("/api/prompt-templates/:templateId/versions", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { templateId } = request.params as { readonly templateId: string };
    const validationError = validatePromptVersionBody(toBody(request.body));

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    const version = await appendPromptVersion(options, templateId, request.body);
    return "error" in version
      ? reply.status(404).send(errorResponse(`Prompt template not found: ${templateId}`))
      : reply.status(201).send(version);
  });
  server.put("/api/prompt-templates/:templateId/versions/:versionId/activate", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const version = await setPromptVersionStatus(options, request, "ACTIVE");
    return "error" in version
      ? promptTemplateVersionNotFound(reply, request)
      : version;
  });
  server.put("/api/prompt-templates/:templateId/versions/:versionId/archive", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const version = await setPromptVersionStatus(options, request, "ARCHIVED");
    return "error" in version
      ? promptTemplateVersionNotFound(reply, request)
      : version;
  });
}

function promptTemplateVersionNotFound(reply: FastifyReply, request: FastifyRequest) {
  const { templateId, versionId } = request.params as { readonly templateId: string; readonly versionId: string };
  return reply.status(404).send(errorResponse(`Template or version not found: ${templateId}/${versionId}`));
}
