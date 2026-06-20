import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TaskCheckbox } from "./Tasks.js";
import { I18nProvider } from "../i18n/index.js";

const noop = () => {};

function render(status: "open" | "done"): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <TaskCheckbox status={status} onComplete={noop} />
    </I18nProvider>
  );
}

describe("TaskCheckbox — accessible name", () => {
  it("the open-task complete button carries an aria-label (title alone is not announced)", () => {
    const html = render("open");
    expect(html).toContain('aria-label="Complete"');
  });

  it("the done-task button carries an aria-label", () => {
    const html = render("done");
    expect(html).toContain('aria-label="done"');
  });
});
