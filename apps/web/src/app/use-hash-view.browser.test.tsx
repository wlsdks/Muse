import { afterEach, beforeEach, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";

import { useHashView } from "./use-hash-view.js";
import type { ViewId } from "../lib/view-route.js";

beforeEach(() => {
  window.location.hash = "";
});
afterEach(cleanup);

function Harness() {
  const [view, updateView] = useHashView();
  return (
    <div>
      <p data-view>{view}</p>
      <button onClick={() => updateView("tasks")}>go tasks</button>
      <button onClick={() => updateView("flows")}>go flows</button>
      <button onClick={() => updateView("chat")}>go chat</button>
    </div>
  );
}

function currentView(container: Element): string {
  return container.querySelector("[data-view]")!.textContent ?? "";
}

test("calling updateView both re-renders the view AND updates location.hash", async () => {
  const screen = await render(<Harness />);

  expect(currentView(screen.container)).toBe("chat");
  expect(window.location.hash).toBe("#/chat");

  await screen.getByRole("button", { name: "go tasks" }).click();
  expect(currentView(screen.container)).toBe("tasks");
  expect(window.location.hash).toBe("#/tasks");

  await screen.getByRole("button", { name: "go flows" }).click();
  expect(currentView(screen.container)).toBe("flows");
  expect(window.location.hash).toBe("#/flows");
});

test("mounting with an existing hash initializes the view from it", async () => {
  window.location.hash = "#/tasks";

  const screen = await render(<Harness />);

  await expect.poll(() => currentView(screen.container)).toBe("tasks");
  expect(window.location.hash).toBe("#/tasks");
});

test("an unknown/garbage hash falls back to chat, and the address bar is normalized to match — no crash, no blank render", async () => {
  window.location.hash = "#/nope-garbage";

  const screen = await render(<Harness />);

  await expect.poll(() => currentView(screen.container)).toBe("chat");
  await expect.poll(() => window.location.hash).toBe("#/chat");
  expect(screen.container.textContent).toContain("chat");
});

test("a browser back/forward (hashchange) is followed without going through updateView", async () => {
  const screen = await render(<Harness />);
  await screen.getByRole("button", { name: "go tasks" }).click();
  expect(currentView(screen.container)).toBe("tasks");

  // Simulate the browser restoring a prior hash on back/forward: this
  // changes location.hash WITHOUT calling updateView, then fires the
  // native hashchange event exactly like a real navigation would.
  window.location.hash = "#/flows";
  window.dispatchEvent(new HashChangeEvent("hashchange"));

  await expect.poll(() => currentView(screen.container)).toBe("flows");
});

test("does not write a redundant hash when updateView targets the already-current view", async () => {
  const screen = await render(<Harness />);
  await screen.getByRole("button", { name: "go chat" }).click();

  expect(currentView(screen.container)).toBe("chat");
  expect(window.location.hash).toBe("#/chat");
});

test("round-trips through every reachable id in the harness without ever landing on an invalid hash", async () => {
  const screen = await render(<Harness />);
  const ids: readonly ViewId[] = ["tasks", "flows", "chat"];
  for (const id of ids) {
    await screen.getByRole("button", { name: `go ${id}` }).click();
    expect(currentView(screen.container)).toBe(id);
    expect(window.location.hash).toBe(`#/${id}`);
  }
});
