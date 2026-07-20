import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActuatorModeControl } from "./Settings.js";
import { createApiClient } from "../api/client.js";
import { DICTIONARIES } from "../i18n/strings.js";
import { I18nProvider } from "../i18n/index.js";

// Statically rendered — effects don't run under renderToStaticMarkup, so
// useQuery sits in its initial (loading, data undefined) state. That is exactly
// the first-paint state a user sees before the fetch resolves, and it is the
// state that matters most here: it must show `off`, never a permissive mode.
function render(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = createApiClient("http://127.0.0.1:3030", "");
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ActuatorModeControl client={client} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe("ActuatorModeControl", () => {
  it("shows `off` before the fetch resolves — never a permissive default", () => {
    const html = render();
    expect(html).toContain(DICTIONARIES.en["settings.actuators.off"]);
    expect(html).toContain(DICTIONARIES.en["settings.actuators.off.hint"]);
  });

  it("offers all three modes", () => {
    const html = render();
    for (const key of ["settings.actuators.off", "settings.actuators.ask", "settings.actuators.auto"] as const) {
      expect(html).toContain(DICTIONARIES.en[key]);
    }
  });

  it("states the consequence of the current mode, not just its name", () => {
    // The setting decides whether Muse can email a real person; the UI must say
    // so rather than leaving it to a tooltip.
    expect(render()).toContain(DICTIONARIES.en["settings.actuators.off.hint"]);
  });

  it("keeps the Korean dictionary in parity — every actuator key is translated", () => {
    const keys = Object.keys(DICTIONARIES.en).filter((k) => k.startsWith("settings.actuators") || k === "settings.sec.actuators");
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const ko = DICTIONARIES.ko[key as keyof typeof DICTIONARIES.ko];
      expect(ko, `missing ko translation for ${key}`).toBeTruthy();
      expect(ko).not.toBe(DICTIONARIES.en[key as keyof typeof DICTIONARIES.en]);
    }
  });
});
