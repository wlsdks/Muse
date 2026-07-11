import { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  CLOUD_PROVIDERS,
  cloudPrivacyRoutingGuidance,
  planCloudSetup,
  registerSetupCloudCommand,
  type SetupCloudHelpers
} from "./commands-setup-cloud.js";
import type { ProgramIO } from "./program.js";

describe("planCloudSetup — cloud BYO-key onboarding (muse setup cloud)", () => {
  it("unknown provider → undefined", () => {
    expect(planCloudSetup("llama-cloud", {})).toBeUndefined();
  });
  it("cloud allowed by default: only the API key is required when nothing is set", () => {
    const plan = planCloudSetup("gemini", {})!;
    expect(plan.defaultModel).toBe("gemini/gemini-2.0-flash");
    expect(plan.keyPresent).toBe(false);
    expect(plan.localOnlyDisabled).toBe(true);
    expect(plan.requiredExports).toEqual(["export GEMINI_API_KEY=<your-key>"]);
  });
  it("a --model override is namespaced under the provider id", () => {
    expect(planCloudSetup("anthropic", {}, "claude-opus-4-8")!.defaultModel).toBe("anthropic/claude-opus-4-8");
  });
  it("detects a present key (incl. the alias GOOGLE_API_KEY) → ready, no exports", () => {
    const plan = planCloudSetup("gemini", { GOOGLE_API_KEY: "k" })!;
    expect(plan.keyPresent).toBe(true);
    expect(plan.localOnlyDisabled).toBe(true);
    expect(plan.requiredExports).toEqual([]);
  });
  it("key present but local-only explicitly forced on → must unset MUSE_LOCAL_ONLY (the gate would refuse otherwise)", () => {
    const plan = planCloudSetup("openai", { OPENAI_API_KEY: "k", MUSE_LOCAL_ONLY: "true" })!;
    expect(plan.localOnlyDisabled).toBe(false);
    expect(plan.requiredExports).toEqual(["unset MUSE_LOCAL_ONLY"]);
  });
  it("every provider has a key env var and a namespaced default model", () => {
    for (const p of CLOUD_PROVIDERS) {
      expect(p.keyEnvVars.length).toBeGreaterThan(0);
      expect(p.defaultModel.startsWith(`${p.id}/`)).toBe(true);
    }
  });
});

describe("cloudPrivacyRoutingGuidance — the privacy-tiered-routing guidance step", () => {
  it("names the routing env, the exact cloud model example, the personal-stays-local behavior, and the local-only override", () => {
    const text = cloudPrivacyRoutingGuidance("gemini/gemini-2.0-flash");
    expect(text).toContain("MUSE_PRIVACY_ROUTING");
    expect(text).toContain("MUSE_CLOUD_MODEL=gemini/gemini-2.0-flash");
    expect(text).toMatch(/persona|memory|PII|possessive/);
    expect(text).toContain("LOCAL");
    expect(text).toContain("MUSE_LOCAL_ONLY");
  });
});

describe("muse setup cloud — action surfaces the privacy-routing guidance to the user", () => {
  function makeIo(): { readonly io: ProgramIO; readonly out: string[] } {
    const out: string[] = [];
    const io = {
      stderr: () => undefined,
      stdout: (m: string) => out.push(m)
    } as unknown as ProgramIO;
    return { io, out };
  }

  function makeHelpers(): SetupCloudHelpers {
    return {
      readConfigStore: async () => ({}),
      writeConfigStore: async () => undefined
    };
  }

  it("--check mode still prints the MUSE_PRIVACY_ROUTING guidance (guidance, not a state change)", async () => {
    const { io, out } = makeIo();
    const program = new Command("muse");
    program.exitOverride();
    program.command("setup").description("setup");
    registerSetupCloudCommand(program, io, makeHelpers());

    await program.parseAsync(["node", "muse", "setup", "cloud", "--provider", "gemini", "--check"]);

    const text = out.join("");
    expect(text).toContain("MUSE_PRIVACY_ROUTING");
    expect(text).toContain("MUSE_CLOUD_MODEL=gemini/gemini-2.0-flash");
  });

  it("write mode (no --check) also prints the guidance", async () => {
    const { io, out } = makeIo();
    const program = new Command("muse");
    program.exitOverride();
    program.command("setup").description("setup");
    registerSetupCloudCommand(program, io, makeHelpers());

    await program.parseAsync(["node", "muse", "setup", "cloud", "--provider", "gemini"]);

    const text = out.join("");
    expect(text).toContain("MUSE_PRIVACY_ROUTING");
  });
});
