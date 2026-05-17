# 313 — a failed email-change in InMemoryUserStore locked the user out

## Why

`InMemoryUserStore.update` (`@muse/auth`) reindexes a user when
their email changes. It mutated **before** validating:

```ts
if (existing && existing.email !== email) {
  this.usersByEmail.delete(existing.email);   // <- delete old key FIRST
}
const duplicate = this.usersByEmail.get(email);
if (duplicate && duplicate.id !== user.id) {
  throw new AuthError("USER_EXISTS", …);      // <- then maybe throw
}
this.usersById.set(user.id, user);
```

If user A changes their email to one already registered to user
B, the old-email key `usersByEmail["a@x"]` is deleted, *then*
the duplicate check throws `USER_EXISTS`. The throw aborts before
`usersById`/`usersByEmail` are re-set — so the store is left
**inconsistent**: A is still in `usersById` (and counted) but
`findByEmail("a@x")` now returns `undefined`. A is a ghost —
**silently locked out of their own account** by a *rejected*
email-change. Classic validate-after-mutate ordering bug on a
security-adjacent store.

## Scope

`packages/auth/src/user-stores.ts` — `update`:

- Reorder to **validate before mutate**: compute `duplicate`
  and throw `USER_EXISTS` *first*; only then delete the old
  email key and set the new indexes. One short WHY comment
  records the lock-out rationale.

Behaviour-preserving for the success path (no collision): the
final `usersById` / `usersByEmail` state is identical; only a
*rejected* update now leaves the store untouched instead of
corrupted.

## Verify

- `pnpm --filter @muse/auth test` — 35 pass (was 33; +2). New
  regressions: `update(A.id → B's email)` throws
  `/User already exists/` **and** `findByEmail("a@x.com")` still
  resolves to A with its original email, B untouched,
  `count() === 2` (pre-fix: A unreachable / ghost); a
  *successful* `update(old@→new@)` reindexes under the new
  email, frees the old key, `count() === 1`. The existing
  store-by-normalized-id / authenticate / Kysely-mapping tests
  stay green.
- `pnpm check` — every workspace green (auth 35, apps/cli 563,
  apps/api 161, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (deterministic
  in-memory user-store state mutation). A live Qwen run cannot
  reproduce a colliding email-change on demand, so the
  deterministic regression is the rigorous verification — same
  stance as the auth/security goals 268 / 269 / 283.

## Status

done — `InMemoryUserStore.update` now validates the duplicate
collision before touching any index, so a rejected email-change
no longer deletes the user's email key and silently locks them
out. Successful updates and all prior behaviour are unchanged.
