/**
 * The default user id the runtime's user-scoped surfaces resolve to:
 * `MUSE_USER_ID ?? USER ?? "default"`, treating empty / whitespace-only
 * as unset (a shell that pre-clears `MUSE_USER_ID=` must fall through, not
 * match an empty bucket).
 *
 * Single source of truth so the bucket a fact / episode is WRITTEN under
 * always matches the bucket recall READS. The CLI's `resolveDefaultUserKey`
 * (which additionally honours a `--user` override + persona slot) delegates
 * its env base here; the assembly's knowledge_search corpus sources use it
 * directly. Previously the corpus sources hard-coded `?? "user"`, so a user
 * without `MUSE_USER_ID` had their memory/episodes written under `$USER`
 * but read back under `"user"` — a silent empty-bucket recall miss.
 */
export function resolveDefaultUserId(env: Readonly<Record<string, string | undefined>>): string {
  for (const candidate of [env.MUSE_USER_ID, env.USER]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "default";
}
