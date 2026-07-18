import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import type { ApiClient } from "../api/client.js";
import type { DayRhythmStateResponse, MessagingSetupResponse } from "../api/types.js";
import { I18nProvider, useI18n } from "../i18n/index.js";
import { DayRhythmCard } from "./Home.js";

const TELEGRAM_PROVIDERS: MessagingSetupResponse["providers"] = [
  {
    configured: true,
    displayName: "Telegram",
    docsUrl: "https://core.telegram.org/bots#botfather",
    id: "telegram",
    pairedOwner: "555",
    registered: true,
    source: "file"
  }
];

function TestCard(props: {
  readonly client: ApiClient;
  readonly messagingProviders?: MessagingSetupResponse["providers"];
  readonly onNavigate?: (view: string) => void;
}) {
  const { t } = useI18n();
  return <DayRhythmCard client={props.client} messagingProviders={props.messagingProviders} onNavigate={props.onNavigate} t={t} />;
}

function renderCard(props: {
  readonly get: (path: string) => Promise<unknown>;
  readonly post: (path: string, body?: Record<string, unknown>) => Promise<unknown>;
  readonly messagingProviders?: MessagingSetupResponse["providers"];
  readonly onNavigate?: (view: string) => void;
}) {
  window.localStorage.setItem("muse.lang", "en");
  const forbidden = vi.fn(async () => {
    throw new Error("unexpected mutating API call");
  });
  const client = {
    baseUrl: "http://day-rhythm.test",
    del: forbidden,
    get: props.get,
    patch: forbidden,
    post: props.post,
    put: forbidden
  } as unknown as ApiClient;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TestCard client={client} messagingProviders={props.messagingProviders} onNavigate={props.onNavigate} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

test("off state: shows the one-line explainer and a single turn-on button", async () => {
  const state: DayRhythmStateResponse = { enabled: false, eveningHour: 18, morningHour: 8, pairedChannel: null };
  const get = vi.fn(async () => state);
  const post = vi.fn(async () => { throw new Error("should not POST in this test"); });

  const screen = await renderCard({ get, post });

  await expect.element(screen.getByText("Day rhythm", { exact: true })).toBeVisible();
  await expect.element(
    screen.getByText("Turn this on and Muse sends a morning briefing and an evening wrap-up to your paired channel automatically.", { exact: true })
  ).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Turn on day rhythm" })).toBeVisible();
  expect(screen.container.textContent).not.toContain("Morning briefing");
});

test("unpaired state: honest message + a deep link into 연동/integrations, never a silent send", async () => {
  const state: DayRhythmStateResponse = { enabled: true, eveningHour: 18, morningHour: 8, pairedChannel: null };
  const get = vi.fn(async () => state);
  const post = vi.fn(async () => { throw new Error("should not POST in this test"); });
  const onNavigate = vi.fn();

  const screen = await renderCard({ get, onNavigate, post });

  await expect.element(
    screen.getByText("Day rhythm is on, but no channel is paired yet — nothing can be delivered.", { exact: true })
  ).toBeVisible();
  const link = screen.getByRole("button", { name: "Connect a channel →" });
  await expect.element(link).toBeVisible();
  await link.click();
  expect(onNavigate).toHaveBeenCalledWith("integrations");
  expect(post).not.toHaveBeenCalled();
});

test("on state: shows the morning/evening times + the paired channel's display name, and 'turn off' POSTs enabled:false", async () => {
  let current: DayRhythmStateResponse = {
    enabled: true,
    eveningHour: 19,
    morningHour: 7,
    pairedChannel: { destination: "555", providerId: "telegram" }
  };
  const get = vi.fn(async () => current);
  const post = vi.fn(async (path: string, body?: Record<string, unknown>) => {
    expect(path).toBe("/api/day-rhythm");
    expect(body).toEqual({ enabled: false });
    current = { ...current, enabled: false, pairedChannel: null };
    return current;
  });

  const screen = await renderCard({ get, messagingProviders: TELEGRAM_PROVIDERS, post });

  await expect.element(screen.getByText("Morning briefing ~7:00 · Evening wrap-up ~19:00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("via Telegram", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Turn off" }).click();

  expect(post).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByRole("button", { name: "Turn on day rhythm" })).toBeVisible();
});
