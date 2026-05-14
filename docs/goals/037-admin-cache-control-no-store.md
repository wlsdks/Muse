# 037 — Cache-Control: no-store on /api/admin/* responses

## Why

Admin endpoints return live operator data (doctor snapshots, run
history, trace tails). Without an explicit Cache-Control, intermediate
proxies could cache them. Surface Cache-Control: no-store on every
/api/admin/* response.

## Scope

- Fastify hook on the /api/admin route prefix.
- api test asserts the header on a doctor + runs route.

## Verify

- api +1-2 tests.

## Status

done — onRequest hook sets `Cache-Control: no-store` on every
URL starting with `/api/admin/`. api +2 tests (admin gets the
header; non-admin /health does not).
