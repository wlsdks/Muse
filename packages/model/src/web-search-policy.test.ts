import { describe, expect, it } from "vitest";

import { decideWebSearchPolicy } from "./web-search-policy.js";

describe("decideWebSearchPolicy", () => {
  const baseModel = { provider: "openai", modelId: "gpt-4o" };

  it("defaults to enabled when nothing set", () => {
    const r = decideWebSearchPolicy({ model: baseModel, settings: {}, env: {} });
    expect(r.enabled).toBe(true);
  });

  it("env MUSE_WEB_SEARCH=off forces disabled even with override true", () => {
    const r = decideWebSearchPolicy({
      model: baseModel,
      settings: { webSearch: { enabled: true } },
      override: true,
      env: { MUSE_WEB_SEARCH: "off" }
    });
    expect(r.enabled).toBe(false);
  });

  it("explicit override=true wins over settings.enabled=false", () => {
    const r = decideWebSearchPolicy({
      model: baseModel,
      settings: { webSearch: { enabled: false } },
      override: true,
      env: {}
    });
    expect(r.enabled).toBe(true);
  });

  it("override=false disables even with settings.enabled=true", () => {
    const r = decideWebSearchPolicy({
      model: baseModel,
      settings: { webSearch: { enabled: true } },
      override: false,
      env: {}
    });
    expect(r.enabled).toBe(false);
  });

  it("settings.enabled=false disables when no override", () => {
    const r = decideWebSearchPolicy({
      model: baseModel,
      settings: { webSearch: { enabled: false } },
      env: {}
    });
    expect(r.enabled).toBe(false);
  });

  it("maxUses precedence: env > settings, defaults to 5", () => {
    expect(
      decideWebSearchPolicy({ model: baseModel, settings: {}, env: {} }).maxUses
    ).toBe(5);
    expect(
      decideWebSearchPolicy({
        model: baseModel,
        settings: { webSearch: { maxUses: 3 } },
        env: {}
      }).maxUses
    ).toBe(3);
    expect(
      decideWebSearchPolicy({
        model: baseModel,
        settings: { webSearch: { maxUses: 3 } },
        env: { MUSE_WEB_SEARCH_MAX_USES: "9" }
      }).maxUses
    ).toBe(9);
  });

  it("a settings.maxUses that is non-finite / non-integer falls through to the default — the env path rejects these via strictPositiveInt, the settings path must match", () => {
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, 3.5, 0, -1]) {
      expect(
        decideWebSearchPolicy({
          model: baseModel,
          settings: { webSearch: { maxUses: bad } },
          env: {}
        }).maxUses,
        `settings.maxUses=${String(bad)} must not be accepted as a search budget`
      ).toBe(5);
    }
    // A legitimate positive integer is still honoured.
    expect(
      decideWebSearchPolicy({ model: baseModel, settings: { webSearch: { maxUses: 7 } }, env: {} }).maxUses
    ).toBe(7);
  });

  it("MUSE_WEB_SEARCH_MAX_USES that is not a positive integer falls through", () => {
    expect(
      decideWebSearchPolicy({
        model: baseModel,
        settings: {},
        env: { MUSE_WEB_SEARCH_MAX_USES: "abc" }
      }).maxUses
    ).toBe(5);
  });

  it("a lenient-prefix MAX_USES typo falls through instead of being silently accepted (goal-463 runtime sibling)", () => {
    for (const bad of ["3x", "30s", "1e3", "5.9", "12abc", "1_000", "-3", "0", " "]) {
      expect(
        decideWebSearchPolicy({
          model: baseModel,
          settings: { webSearch: { maxUses: 9 } },
          env: { MUSE_WEB_SEARCH_MAX_USES: bad }
        }).maxUses,
        `"${bad}" must not be accepted as an env budget`
      ).toBe(9);
    }
    expect(
      decideWebSearchPolicy({
        model: baseModel,
        settings: { webSearch: { maxUses: 9 } },
        env: { MUSE_WEB_SEARCH_MAX_USES: "7" }
      }).maxUses
    ).toBe(7);
  });

  it("env MUSE_WEB_SEARCH=on is no-op when nothing else disables", () => {
    const r = decideWebSearchPolicy({
      model: baseModel,
      settings: {},
      env: { MUSE_WEB_SEARCH: "on" }
    });
    expect(r.enabled).toBe(true);
  });

  it("every standard falsy spelling on MUSE_WEB_SEARCH is a hard kill switch (overrides override=true)", () => {
    for (const value of ["false", "False", "FALSE", "0", "no", "NO", "off", "Off"]) {
      const r = decideWebSearchPolicy({
        model: baseModel,
        settings: { webSearch: { enabled: true } },
        override: true,
        env: { MUSE_WEB_SEARCH: value }
      });
      expect(r.enabled, `MUSE_WEB_SEARCH="${value}" must disable`).toBe(false);
    }
  });

  it("truthy MUSE_WEB_SEARCH spellings (true / 1 / yes / on) are NOT a force-enable — override=false still wins", () => {
    for (const value of ["true", "1", "yes", "on", "YES", "On"]) {
      const r = decideWebSearchPolicy({
        model: baseModel,
        settings: { webSearch: { enabled: true } },
        override: false,
        env: { MUSE_WEB_SEARCH: value }
      });
      expect(r.enabled, `MUSE_WEB_SEARCH="${value}" must not override an explicit override:false`).toBe(false);
    }
  });

  it("an unrecognised MUSE_WEB_SEARCH typo is not a kill switch (does not silently disable)", () => {
    for (const value of ["enabled", "disabled", "y", "n", "xyz", "truue", "  "]) {
      const r = decideWebSearchPolicy({
        model: baseModel,
        settings: { webSearch: { enabled: true } },
        env: { MUSE_WEB_SEARCH: value }
      });
      expect(r.enabled, `MUSE_WEB_SEARCH="${value}" must not flip the policy`).toBe(true);
    }
  });
});
