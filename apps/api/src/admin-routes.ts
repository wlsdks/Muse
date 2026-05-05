import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface AdminRouteOptions {
  readonly authorizeAdmin: (request: FastifyRequest, reply: FastifyReply) => boolean;
  readonly admin?: AdminRouteState;
}

export interface AdminRouteState {
  readonly cache?: {
    readonly metrics?: { snapshot(): unknown };
    readonly responseCache?: {
      invalidateAll(): void;
      invalidate?(key: string): boolean;
      invalidateByPattern?(pattern: string): number;
      size?(): number;
    };
  };
  readonly observability?: {
    readonly metrics?: { recordedEvents(): readonly unknown[] };
    readonly tracer?: { recordedSpans(): readonly unknown[] };
  };
  readonly resilience?: {
    readonly circuitBreakerRegistry?: {
      getIfExists(name: string): CircuitBreakerView | undefined;
      names(): readonly string[];
      resetAll(): void;
    };
  };
}

interface CircuitBreakerView {
  metrics(): unknown;
  reset(): void;
  state(): string;
}

export function registerAdminRoutes(server: FastifyInstance, options: AdminRouteOptions): void {
  server.get("/admin/metrics", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return {
      events: options.admin?.observability?.metrics?.recordedEvents() ?? [],
      spans: options.admin?.observability?.tracer?.recordedSpans() ?? []
    };
  });

  server.get("/admin/cache", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const cache = options.admin?.cache?.responseCache;

    return {
      metrics: options.admin?.cache?.metrics?.snapshot() ?? null,
      size: cache?.size?.() ?? null
    };
  });

  server.delete("/admin/cache", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    options.admin?.cache?.responseCache?.invalidateAll();
    return { invalidated: true };
  });

  server.delete("/admin/cache/:key", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { key } = request.params as { readonly key: string };
    return {
      invalidated: options.admin?.cache?.responseCache?.invalidate?.(key) ?? false,
      key
    };
  });

  server.post("/admin/cache/invalidate-pattern", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    if (!isRecord(request.body) || typeof request.body.pattern !== "string") {
      return reply.status(400).send({
        code: "INVALID_CACHE_PATTERN",
        message: "Body must include a pattern string"
      });
    }

    return {
      invalidated: options.admin?.cache?.responseCache?.invalidateByPattern?.(request.body.pattern) ?? 0,
      pattern: request.body.pattern
    };
  });

  server.get("/admin/resilience/circuit-breakers", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const registry = options.admin?.resilience?.circuitBreakerRegistry;

    return (registry?.names() ?? []).map((name) => {
      const breaker = registry?.getIfExists(name);

      return {
        metrics: breaker?.metrics() ?? null,
        name,
        state: breaker?.state() ?? "unknown"
      };
    });
  });

  server.post("/admin/resilience/circuit-breakers/:name/reset", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { name } = request.params as { readonly name: string };
    const breaker = options.admin?.resilience?.circuitBreakerRegistry?.getIfExists(name);

    if (!breaker) {
      return reply.status(404).send({
        code: "CIRCUIT_BREAKER_NOT_FOUND",
        message: `Circuit breaker not found: ${name}`
      });
    }

    breaker.reset();
    return {
      name,
      state: breaker.state()
    };
  });

  server.post("/admin/resilience/circuit-breakers/reset", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    options.admin?.resilience?.circuitBreakerRegistry?.resetAll();
    return { reset: true };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
