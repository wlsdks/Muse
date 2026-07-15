import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// A real Playwright measurement at 390x844 found these controls with
// right edges past the viewport (page never scrolls horizontally, so
// they were unreachable, not just visually cramped). These assertions
// pin the CSS fix so a future edit can't silently drop the mobile
// collapse and reopen the clip.
const css = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf8");

// theme.css has several separate @media (max-width: 640px) blocks —
// concatenate every one of them so a selector-presence check doesn't
// depend on which block it happens to live in.
function mediaBlocks(maxWidth: string): string {
  const needle = `@media (max-width: ${maxWidth})`;
  let cursor = 0;
  let found = 0;
  let combined = "";
  for (;;) {
    const start = css.indexOf(needle, cursor);
    if (start === -1) break;
    found++;
    const openBrace = css.indexOf("{", start);
    let depth = 0;
    let i = openBrace;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    combined += css.slice(start, i + 1);
    cursor = i + 1;
  }
  expect(found, `no @media (max-width: ${maxWidth}) block found`).toBeGreaterThan(0);
  return combined;
}

describe("theme.css — mobile clipped-controls fixes (390px viewport)", () => {
  it("Calendar's new-event grid (label.field-label > input.input, right=553 offscreen) collapses to one column", () => {
    const block = mediaBlocks("640px");
    expect(block).toContain(".calendar-new-form");
    expect(block).toMatch(/\.calendar-new-form[\s\S]*?grid-template-columns:\s*1fr;/);
  });

  it("Reminders' new-reminder grid (button.btn-primary ADD, right=457 offscreen) collapses to one column", () => {
    const block = mediaBlocks("640px");
    expect(block).toContain(".reminders-new-form");
    expect(block).toMatch(/\.reminders-new-form[\s\S]*?grid-template-columns:\s*1fr;/);
  });

  it("Tasks' card-head action row (span.head-action, right=453 offscreen) wraps instead of overflowing", () => {
    const block = mediaBlocks("640px");
    expect(block).toMatch(/\.card-head\s*\{[^}]*flex-wrap:\s*wrap;/);
  });

  it("Integrations' tip-bubble (span.tip-bubble, right=438-448 offscreen) clamps to the viewport width", () => {
    expect(css).toMatch(/\.tip-bubble\s*\{[^}]*max-width:\s*min\(280px,\s*calc\(100vw - 32px\)\);/);
  });
});
