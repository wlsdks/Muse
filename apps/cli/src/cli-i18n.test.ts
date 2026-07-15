import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CLI_DICTIONARIES,
  detectLangFromLocale,
  getCliLanguage,
  resetCliLanguageCache,
  resolveCliLanguage,
  setCliLanguage,
  t,
  type CliStringKey
} from "./cli-i18n.js";

describe("CLI i18n catalog — EN/KO parity (mirrors apps/web/src/i18n/strings.test.ts)", () => {
  it("ships en and ko with identical key sets", () => {
    const enKeys = Object.keys(CLI_DICTIONARIES.en).sort();
    const koKeys = Object.keys(CLI_DICTIONARIES.ko).sort();
    expect(koKeys).toEqual(enKeys);
  });

  it("leaves no key with an empty translation", () => {
    for (const lang of ["en", "ko"] as const) {
      for (const [key, value] of Object.entries(CLI_DICTIONARIES[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe("");
      }
    }
  });

  it("every EN string differs from its KO counterpart (table-driven distinctness — no un-translated copy-paste)", () => {
    for (const key of Object.keys(CLI_DICTIONARIES.en) as CliStringKey[]) {
      expect(CLI_DICTIONARIES.ko[key], key).not.toBe(CLI_DICTIONARIES.en[key]);
    }
  });

  it("keeps placeholder tokens consistent across languages", () => {
    const tokens = (s: string) => (s.match(/\{(\w+)\}/gu) ?? []).sort();
    for (const key of Object.keys(CLI_DICTIONARIES.en) as CliStringKey[]) {
      expect(tokens(CLI_DICTIONARIES.ko[key]), key).toEqual(tokens(CLI_DICTIONARIES.en[key]));
    }
  });
});

describe("t() — sync lookup, fallback, interpolation", () => {
  afterEach(() => {
    setCliLanguage("en");
  });

  it("renders the active language's template", () => {
    setCliLanguage("ko");
    expect(t("email.setupCancelled")).toBe("설정이 취소됐어요.");
    setCliLanguage("en");
    expect(t("email.setupCancelled")).toBe("Setup cancelled.");
  });

  it("fills {param} placeholders", () => {
    setCliLanguage("en");
    expect(t("email.oauth.connectedAs", { email: "user@example.com" })).toBe("✓ connected as user@example.com");
  });

  it("leaves an unmatched placeholder token untouched rather than throwing", () => {
    expect(t("email.oauth.connectedAs")).toContain("{email}");
  });

  it("never throws and never prints the literal string 'undefined' for a missing key (falls back to the key itself)", () => {
    // @ts-expect-error deliberately probing a key outside the catalog's type
    const rendered = t("no.such.key");
    expect(rendered).toBe("no.such.key");
    expect(rendered).not.toContain("undefined");
  });
});

describe("detectLangFromLocale", () => {
  it("a Korean-family LANG resolves to ko", () => {
    expect(detectLangFromLocale({ LANG: "ko_KR.UTF-8" })).toBe("ko");
  });

  it("falls back to LC_ALL, then LC_MESSAGES, when LANG is unset", () => {
    expect(detectLangFromLocale({ LC_ALL: "ko_KR.UTF-8" })).toBe("ko");
    expect(detectLangFromLocale({ LC_MESSAGES: "ko_KR.UTF-8" })).toBe("ko");
  });

  it("an English or unset locale resolves to en", () => {
    expect(detectLangFromLocale({ LANG: "en_US.UTF-8" })).toBe("en");
    expect(detectLangFromLocale({})).toBe("en");
  });
});

describe("resolveCliLanguage — MUSE_LANG env > config > OS-locale auto-detect, cached per process", () => {
  beforeEach(() => {
    resetCliLanguageCache();
  });
  afterEach(() => {
    resetCliLanguageCache();
    setCliLanguage("en");
  });

  it("MUSE_LANG wins over both config and locale", async () => {
    const lang = await resolveCliLanguage(
      { LANG: "ko_KR.UTF-8", MUSE_LANG: "en" },
      async () => ({ language: "ko" })
    );
    expect(lang).toBe("en");
    expect(getCliLanguage()).toBe("en");
  });

  it("config wins over locale when MUSE_LANG is absent", async () => {
    const lang = await resolveCliLanguage(
      { LANG: "en_US.UTF-8" },
      async () => ({ language: "ko" })
    );
    expect(lang).toBe("ko");
  });

  it("falls back to OS-locale auto-detect when neither env nor config set a language", async () => {
    const lang = await resolveCliLanguage(
      { LANG: "ko_KR.UTF-8" },
      async () => ({})
    );
    expect(lang).toBe("ko");
  });

  it("an invalid MUSE_LANG value is ignored, falling through to config", async () => {
    const lang = await resolveCliLanguage(
      { MUSE_LANG: "fr" },
      async () => ({ language: "ko" })
    );
    expect(lang).toBe("ko");
  });

  it("caches the resolution — a second call does not re-invoke configRead", async () => {
    let calls = 0;
    const configRead = async (): Promise<{ readonly language?: string }> => {
      calls += 1;
      return { language: "ko" };
    };
    await resolveCliLanguage({}, configRead);
    await resolveCliLanguage({ MUSE_LANG: "en" }, configRead);
    expect(calls).toBe(1);
    expect(getCliLanguage()).toBe("ko");
  });

  it("the cached fast-path still syncs t()'s active language — a direct setCliLanguage elsewhere can't leave it stale", async () => {
    await resolveCliLanguage({}, async () => ({ language: "ko" }));
    expect(getCliLanguage()).toBe("ko");
    setCliLanguage("en"); // simulates an unrelated direct call drifting currentLang away from the cached resolution
    expect(getCliLanguage()).toBe("en");
    await resolveCliLanguage({ MUSE_LANG: "en" }, async () => ({})); // cached — env/config args here are ignored
    expect(getCliLanguage()).toBe("ko");
  });

  it("resetCliLanguageCache lets a later call re-resolve", async () => {
    await resolveCliLanguage({}, async () => ({ language: "ko" }));
    expect(getCliLanguage()).toBe("ko");
    resetCliLanguageCache();
    await resolveCliLanguage({}, async () => ({ language: "en" }));
    expect(getCliLanguage()).toBe("en");
  });
});
