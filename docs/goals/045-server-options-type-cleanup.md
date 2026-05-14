# 045 — Trim apps/api/src/server.ts ServerOptions block (565 LOC)

## Why

server.ts is just over the 700-LOC threshold (565 actually). The
ServerOptions interface is ~150 LOC of optional fields. Extract to its
own types module so the registrations have more breathing room.

## Scope

- New apps/api/src/server-options.ts with ServerOptions + nested types.
- server.ts imports the type only.

## Verify

- All gates green.

## Status

done — `ServerOptions` + `CorsOptions` + `ToolCatalogEntry` moved
to new `apps/api/src/server-options.ts` (185 LOC). `server.ts`
shrank from 597 → 428 LOC and dropped ~15 type-only imports that
were only there for the option block. The three types are
re-exported from `server.ts` so callers stay byte-identical.
All gates green.
