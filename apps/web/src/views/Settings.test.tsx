import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuietHoursStatus } from "./Settings.js";
import { DICTIONARIES } from "../i18n/strings.js";
import { I18nProvider } from "../i18n/index.js";

import type { Translate } from "../i18n/index.js";

const enT = ((key: keyof typeof DICTIONARIES.en, vars?: Record<string, string | number>) => {
  const template = DICTIONARIES.en[key];
  return vars ? template.replace(/\{(\w+)\}/gu, (match, name: string) => (name in vars ? String(vars[name]) : match)) : template;
}) as unknown as Translate;

function render(quietHours: string | undefined): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <QuietHoursStatus quietHours={quietHours} t={enT} />
    </I18nProvider>
  );
}

describe("QuietHoursStatus — read-only status line (no persisted settings-store seam exists)", () => {
  it("shows the raw env window when set", () => {
    const html = render("22-7");
    expect(html).toContain("22-7");
    expect(html).toContain("MUSE_REMINDER_QUIET_HOURS");
  });

  it("shows the not-set copy (still naming the env var) when unset", () => {
    const html = render(undefined);
    expect(html).toContain(DICTIONARIES.en["settings.quietHoursNotSet"]);
    expect(html).toContain("MUSE_REMINDER_QUIET_HOURS");
  });

  it("never renders an input/button — this is read-only, there is no editor to accidentally lie about", () => {
    const html = render("22-7");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
  });

  it("EN and KO copy differ and both name the same env var", () => {
    for (const key of ["settings.quietHours", "settings.sec.quietHours", "settings.quietHoursNotSet"] as const) {
      expect(DICTIONARIES.en[key]).toBeTruthy();
      expect(DICTIONARIES.ko[key]).toBeTruthy();
      expect(DICTIONARIES.en[key]).not.toBe(DICTIONARIES.ko[key]);
    }
    expect(DICTIONARIES.ko["settings.quietHoursNotSet"]).toContain("MUSE_REMINDER_QUIET_HOURS");
  });
});
