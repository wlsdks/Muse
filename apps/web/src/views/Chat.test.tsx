import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { STARTER_PROMPTS, StarterChips, applyStarterPrompt, ChatEmptyState } from "./Chat.js";
import { DICTIONARIES } from "../i18n/strings.js";
import { I18nProvider } from "../i18n/index.js";

import type { ReactElement } from "react";
import type { Translate } from "../i18n/index.js";

const identityT = ((key: string) => key) as unknown as Translate;

function isReactElement(node: unknown): node is ReactElement {
  return node !== null && typeof node === "object" && "props" in (node as object);
}

/** Walks a plain (unrendered) React element tree — valid here because
 * `StarterChips` calls no hooks, so it can be invoked directly as a plain
 * function without a React render pass or DOM. */
function collectButtons(node: unknown, acc: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectButtons(child, acc);
    }
    return acc;
  }
  if (!isReactElement(node)) {
    return acc;
  }
  if (node.type === "button") {
    acc.push(node);
  }
  const children = (node.props as { children?: unknown }).children;
  if (children !== undefined) {
    collectButtons(children, acc);
  }
  return acc;
}

describe("STARTER_PROMPTS — grounded, bilingual, distinct copy", () => {
  it("every label/prompt key resolves to non-empty, distinct EN and KO copy", () => {
    for (const { labelKey, promptKey } of STARTER_PROMPTS) {
      for (const lang of ["en", "ko"] as const) {
        expect(DICTIONARIES[lang][labelKey]).toBeTruthy();
        expect(DICTIONARIES[lang][promptKey]).toBeTruthy();
      }
      expect(DICTIONARIES.en[labelKey]).not.toBe(DICTIONARIES.ko[labelKey]);
      expect(DICTIONARIES.en[promptKey]).not.toBe(DICTIONARIES.ko[promptKey]);
    }
  });

  it("has 3-4 chips (the recommended range for a starter row)", () => {
    expect(STARTER_PROMPTS.length).toBeGreaterThanOrEqual(3);
    expect(STARTER_PROMPTS.length).toBeLessThanOrEqual(4);
  });
});

describe("StarterChips — renders one button per prompt, wired to onPick", () => {
  it("renders a labeled group with one button per starter prompt", () => {
    const html = renderToStaticMarkup(<StarterChips onPick={() => {}} t={identityT} />);
    expect(html).toContain('role="group"');
    expect(html).toContain("starter-chips");
    expect((html.match(/class="starter-chip"/g) ?? []).length).toBe(STARTER_PROMPTS.length);
    for (const { labelKey } of STARTER_PROMPTS) {
      expect(html).toContain(`>${labelKey}<`);
    }
  });

  it("clicking each chip fills the exact mapped prompt — never a different or empty string", () => {
    const onPick = vi.fn();
    // Calling the component directly is safe: it uses no hooks (`t` is a prop).
    const tree = StarterChips({ onPick, t: identityT });
    const buttons = collectButtons(tree);
    expect(buttons).toHaveLength(STARTER_PROMPTS.length);

    buttons.forEach((button, i) => {
      onPick.mockClear();
      (button.props as { onClick: () => void }).onClick();
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(onPick).toHaveBeenCalledWith(STARTER_PROMPTS[i]!.promptKey);
    });
  });
});

describe("applyStarterPrompt — fill + focus, never auto-send", () => {
  it("sets the draft to the exact prompt and focuses the composer", () => {
    const setDraft = vi.fn();
    const focus = vi.fn();
    const textareaRef = { current: { focus } as unknown as HTMLTextAreaElement };

    applyStarterPrompt("Summarize my recent notes.", setDraft, textareaRef);

    expect(setDraft).toHaveBeenCalledTimes(1);
    expect(setDraft).toHaveBeenCalledWith("Summarize my recent notes.");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("tolerates a not-yet-mounted textarea ref (no throw)", () => {
    const setDraft = vi.fn();
    const textareaRef = { current: null };
    expect(() => applyStarterPrompt("hello", setDraft, textareaRef)).not.toThrow();
    expect(setDraft).toHaveBeenCalledWith("hello");
  });
});

describe("ChatEmptyState — starter chips only appear in the empty state", () => {
  function render(hasMessages: boolean): string {
    return renderToStaticMarkup(
      <I18nProvider>
        <ChatEmptyState hasMessages={hasMessages} onPickStarter={() => {}} />
      </I18nProvider>
    );
  }

  it("shows the welcome copy and starter chips with real i18n labels when there are no messages", () => {
    const html = render(false);
    expect(html).toContain(DICTIONARIES.en["chat.askAnything"]);
    expect(html).toContain(DICTIONARIES.en["chat.askSub"]);
    expect(html).toContain("starter-chips");
    for (const { labelKey } of STARTER_PROMPTS) {
      expect(html).toContain(DICTIONARIES.en[labelKey]);
    }
  });

  it("renders nothing once the conversation has messages", () => {
    const html = render(true);
    expect(html).toBe("");
    expect(html).not.toContain("starter-chips");
  });
});
