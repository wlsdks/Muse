import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";

import { I18nProvider, useI18n } from "../i18n/index.js";
import { safeSessionStorage } from "../lib/safe-storage.js";
import {
  applyStarterPrompt,
  ChatContinuitySection,
  ChatReconfirmStrip,
  CreateInBuilderButton,
  STARTER_PROMPTS,
  StarterChips
} from "./Chat.js";
import { consumeAutoContinueThread } from "./home-logic.js";
import { consumeBuilderCopilotSeed, writeBuilderCopilotSeed } from "./scheduled-logic.js";

import type { ApiClient } from "../api/client.js";
import type { ReconfirmCard as ReconfirmCardData } from "../api/types.js";
import type { ReviewThreadSummary } from "./continuity-shared.js";
import type { Translate } from "../i18n/index.js";

const identityT = ((key: string) => key) as unknown as Translate;
const NUDGE_SUPPRESSION_KEY = "muse.chatContinuityNudge.dismissedAt";

afterEach(cleanup);

function StarterPromptHarness() {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <StarterChips
        onPick={(prompt) => applyStarterPrompt(prompt, setDraft, textareaRef)}
        t={identityT}
      />
      <textarea
        aria-label="Message"
        onChange={(event) => setDraft(event.currentTarget.value)}
        ref={textareaRef}
        value={draft}
      />
    </>
  );
}

test("a starter prompt fills and focuses the real composer without auto-submitting", async () => {
  const prompt = STARTER_PROMPTS[0]!;
  const screen = await render(<StarterPromptHarness />);

  await screen.getByRole("button", { name: prompt.labelKey }).click();

  const composer = screen.getByRole("textbox", { name: "Message" });
  await expect.element(composer).toHaveValue(prompt.promptKey);
  await expect.element(composer).toHaveFocus();
});

// A chat response fixture carrying `builderHint` (chat-automation-honesty.ts's
// false-done correction for a recurring-automation ask) renders the "Create
// in Builder" action — clicking it writes the ONE-SHOT sessionStorage seed
// and navigates to the flows view, the exact wiring `ChatSession.createInBuilder`
// does. This harness calls the SAME real helpers (not a mock) so the seed
// round-trips through real sessionStorage.

const AUTOMATION_ASK = "매일 아침 9시에 오늘 일정 요약해주는 자동화 만들어줘";

function BuilderHintHarness({ onNavigate }: { onNavigate: (view: string) => void }) {
  const createInBuilder = (hint: string) => {
    writeBuilderCopilotSeed(safeSessionStorage(), hint);
    onNavigate("flows");
  };
  return <CreateInBuilderButton onCreate={() => createInBuilder(AUTOMATION_ASK)} t={identityT} />;
}

test("clicking 'Create in Builder' seeds the one-shot copilot handoff and navigates to flows", async () => {
  window.sessionStorage.removeItem("muse.builderCopilotSeed");
  const onNavigate = vi.fn();
  const screen = await render(<BuilderHintHarness onNavigate={onNavigate} />);

  await screen.getByRole("button", { name: "chat.automation.createInBuilder" }).click();

  expect(onNavigate).toHaveBeenCalledWith("flows");
  // The real seed helper round-trips through real sessionStorage, one-shot.
  expect(consumeBuilderCopilotSeed(safeSessionStorage())).toBe(AUTOMATION_ASK);
  expect(window.sessionStorage.getItem("muse.builderCopilotSeed")).toBeNull();
});

// Chat's reconfirm strip (`ChatReconfirmStrip`) — the SAME "Muse가 확인하고
// 싶은 것" one-tap question Home's `ReconfirmCard` shows, surfaced in Chat too
// so a PC-only user who never opens Home still meets it. Same shared hook,
// same endpoints, same i18n strings as Home's card; these tests cover the
// chat-specific empty-session gate and the compact single-line rendering.

const RECONFIRM_FIXTURE: ReconfirmCardData = {
  category: "preference",
  evidence: "추측의 신뢰도가 12%로 옅어졌어요.",
  question: "진안은 말투에서 '간결한 답변'을(를) 선호한다고 추측하고 있어요 — 맞나요?",
  slotId: "pref-tone"
};

function TestChatReconfirmStrip(props: { readonly client: ApiClient; readonly isEmptySession: boolean }) {
  const { t } = useI18n();
  return <ChatReconfirmStrip client={props.client} isEmptySession={props.isEmptySession} t={t} />;
}

function renderReconfirmStrip(props: {
  readonly get: (path: string) => Promise<unknown>;
  readonly isEmptySession?: boolean;
  readonly post?: (path: string, body?: Record<string, unknown>) => Promise<unknown>;
}) {
  window.localStorage.setItem("muse.lang", "en");
  const forbiddenPostFn = vi.fn(async () => {
    throw new Error("unexpected POST — the reconfirm strip must never mutate on mere render");
  });
  const client = {
    baseUrl: "http://chat-reconfirm.test",
    get: props.get,
    post: props.post ?? forbiddenPostFn
  } as unknown as ApiClient;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TestChatReconfirmStrip client={client} isEmptySession={props.isEmptySession ?? true} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

test("reconfirm strip: renders the card fixture — badge, question, and both buttons — on an EMPTY session", async () => {
  const get = vi.fn(async () => ({ card: RECONFIRM_FIXTURE }));

  const screen = await renderReconfirmStrip({ get });

  await expect.element(screen.getByText("Guess", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(RECONFIRM_FIXTURE.question, { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Yes, that's right" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "No, that's wrong" })).toBeVisible();
});

test("reconfirm strip: renders NOTHING on a non-empty session and never fetches", async () => {
  const get = vi.fn(async () => ({ card: RECONFIRM_FIXTURE }));

  const screen = await renderReconfirmStrip({ get, isEmptySession: false });

  expect(screen.container.textContent).toBe("");
  expect(get).not.toHaveBeenCalled();
});

test("reconfirm strip: the mere render never POSTs", async () => {
  const get = vi.fn(async () => ({ card: RECONFIRM_FIXTURE }));

  const screen = await renderReconfirmStrip({ get });

  await expect.element(screen.getByText(RECONFIRM_FIXTURE.question, { exact: true })).toBeVisible();
  // renderReconfirmStrip's default `post` throws if called — reaching this
  // point without a thrown assertion failure already proves no POST fired.
});

test("reconfirm strip: 맞아요/confirm click POSTs the exact verdict body then swaps to the ack line", async () => {
  const get = vi.fn(async () => ({ card: RECONFIRM_FIXTURE }));
  const post = vi.fn(async (path: string, body?: Record<string, unknown>) => {
    expect(path).toBe(`/api/user-model/reconfirm-card/${RECONFIRM_FIXTURE.slotId}`);
    expect(body).toEqual({ verdict: "confirm" });
    return { recorded: true, verdict: "confirm" };
  });

  const screen = await renderReconfirmStrip({ get, post });
  await screen.getByRole("button", { name: "Yes, that's right" }).click();

  expect(post).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByText("Thanks — noted.", { exact: true })).toBeVisible();
  expect(screen.container.textContent).not.toContain(RECONFIRM_FIXTURE.question);
});

test("reconfirm strip: renders nothing when the GET errors — no error noise", async () => {
  const get = vi.fn(async () => {
    throw new Error("reconfirm-card unavailable");
  });

  const screen = await renderReconfirmStrip({ get });

  await expect.poll(() => get.mock.calls.length > 0).toBe(true);
  expect(screen.container.textContent).toBe("");
});

// Chat's session-open continuity nudge (`ChatContinuitySection`). Tested as
// its own component — not through the full `ChatSession` — because it needs
// only `client` + `isEmptySession`, not the session's `useChatStream` SSE
// hook; this mirrors how `StarterChips`/`ChatEmptyState` are tested via
// direct props rather than a full session mount.

const RESUMABLE_THREAD: ReviewThreadSummary = {
  id: "thread_life",
  kind: "life",
  linkCount: 1,
  links: [{ artifactId: "task_prepare", artifactType: "task", providerId: "local", role: "next-step" }],
  title: "Prepare quarterly review"
};

function forbiddenPost() {
  return vi.fn(async (path: string) => {
    throw new Error(`the continuity nudge must never mutate — unexpected POST ${path}`);
  });
}

function renderNudge(props: {
  readonly get: (path: string) => Promise<unknown>;
  readonly isEmptySession?: boolean;
  readonly onNavigate?: (view: string) => void;
  readonly post?: (path: string, body?: Record<string, unknown>) => Promise<unknown>;
}) {
  window.localStorage.setItem("muse.lang", "en");
  const client = { baseUrl: "http://chat-nudge.test", get: props.get, post: props.post ?? forbiddenPost() } as unknown as ApiClient;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ChatContinuitySection client={client} isEmptySession={props.isEmptySession ?? true} onNavigate={props.onNavigate} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

test("renders the nudge for a resumable review fixture, and the mere render never POSTs (read-only until clicked)", async () => {
  window.sessionStorage.removeItem(NUDGE_SUPPRESSION_KEY);
  const post = forbiddenPost();
  const get = vi.fn(async () => ({ threads: [RESUMABLE_THREAD] }));

  const screen = await renderNudge({ get, post });

  await expect.element(screen.getByText("Continue this? — Prepare quarterly review", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Later" })).toBeVisible();
  expect(post).not.toHaveBeenCalled();
});

test("renders nothing when the review reports no resumable thread (empty threads)", async () => {
  window.sessionStorage.removeItem(NUDGE_SUPPRESSION_KEY);
  const get = vi.fn(async () => ({ threads: [] }));

  const screen = await renderNudge({ get });

  expect(screen.container.textContent).toBe("");
});

test("renders nothing when every thread's sources are external only", async () => {
  window.sessionStorage.removeItem(NUDGE_SUPPRESSION_KEY);
  const externalOnly: ReviewThreadSummary = {
    ...RESUMABLE_THREAD,
    links: [{ artifactId: "n1", artifactType: "note", providerId: "notion", role: "context" }]
  };
  const get = vi.fn(async () => ({ threads: [externalOnly] }));

  const screen = await renderNudge({ get });

  expect(screen.container.textContent).toBe("");
});

test("renders nothing when the review API errors — no error noise", async () => {
  window.sessionStorage.removeItem(NUDGE_SUPPRESSION_KEY);
  const get = vi.fn(async () => {
    throw new Error("review unavailable");
  });

  const screen = await renderNudge({ get });

  await expect.poll(() => get.mock.calls.length > 0).toBe(true);
  expect(screen.container.textContent).toBe("");
});

test("renders nothing once the session already has turns, even with a resumable thread", async () => {
  window.sessionStorage.removeItem(NUDGE_SUPPRESSION_KEY);
  const get = vi.fn(async () => ({ threads: [RESUMABLE_THREAD] }));

  const screen = await renderNudge({ get, isEmptySession: false });

  expect(screen.container.textContent).toBe("");
  expect(get).not.toHaveBeenCalled();
});

test("'Later' dismisses the nudge and it does not reappear on remount within the same session", async () => {
  window.sessionStorage.removeItem(NUDGE_SUPPRESSION_KEY);
  const get = vi.fn(async () => ({ threads: [RESUMABLE_THREAD] }));

  const first = await renderNudge({ get });
  await expect.element(first.getByText("Continue this? — Prepare quarterly review", { exact: true })).toBeVisible();
  await first.getByRole("button", { name: "Later" }).click();
  await expect.element(first.getByText("Continue this? — Prepare quarterly review", { exact: true })).not.toBeInTheDocument();

  cleanup();
  const second = await renderNudge({ get });
  expect(second.container.textContent).toBe("");
});

test("'Continue' writes the one-shot Home handoff (the exact thread id) and navigates to home", async () => {
  window.sessionStorage.removeItem(NUDGE_SUPPRESSION_KEY);
  window.sessionStorage.removeItem("muse.homeAutoContinueThreadId");
  const get = vi.fn(async () => ({ threads: [RESUMABLE_THREAD] }));
  const onNavigate = vi.fn();

  const screen = await renderNudge({ get, onNavigate });
  await screen.getByRole("button", { name: "Continue" }).click();

  expect(onNavigate).toHaveBeenCalledWith("home");
  expect(consumeAutoContinueThread(safeSessionStorage())).toBe("thread_life");
});

