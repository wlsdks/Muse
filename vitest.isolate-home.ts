import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point every test FILE's ambient HOME at a fresh throwaway dir so a store
// resolver that falls through to `process.env.HOME` writes into an isolated
// `~/.muse`, never the developer's real one. Runs once per test file (vitest
// evaluates setupFiles per worker before the file's own code). The provider-
// paths guard is the backstop: it throws if a resolver would still land on the
// genuine account home (userInfo().homedir), which this override no longer is.
//
// This lives in the SHARED config because the guard it pairs with is a shared
// module (@muse/autoconfigure provider-paths) that EVERY package reaches — so
// the isolation has to be repo-wide, not per-package, or the guard reddens
// whole suites (apps/cli, etc.) that simply never got the setup.
process.env.HOME = mkdtempSync(join(tmpdir(), "muse-vitest-home-"));
