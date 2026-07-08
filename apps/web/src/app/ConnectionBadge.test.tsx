import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConnectionBadge } from "./App.js";

import type { Translate } from "../i18n/index.js";

const t = ((key: string) => {
  const map: Record<string, string> = {
    "status.connected": "연결됨",
    "status.connecting": "연결 중",
    "status.offline": "오프라인"
  };
  return map[key] ?? key;
}) as unknown as Translate;

function tone(html: string): string {
  const match = /class="badge(?: ([a-z]+))?"/.exec(html);
  return match?.[1] ?? "neutral";
}

describe("ConnectionBadge — connection status driven by the health query, not the raw API URL", () => {
  it("shows a green/ok badge + connected label when the health query resolved ok", () => {
    const html = renderToStaticMarkup(<ConnectionBadge connected loading={false} t={t} />);
    expect(tone(html)).toBe("ok");
    expect(html).toContain("연결됨");
  });

  it("shows a muted/neutral badge + connecting label while the health query is still loading", () => {
    const html = renderToStaticMarkup(<ConnectionBadge connected={false} loading t={t} />);
    expect(tone(html)).toBe("neutral");
    expect(html).toContain("연결 중");
  });

  it("shows an err badge + offline label once the health query settled without ok", () => {
    const html = renderToStaticMarkup(<ConnectionBadge connected={false} loading={false} t={t} />);
    expect(tone(html)).toBe("err");
    expect(html).toContain("오프라인");
  });

  it("never renders the raw API URL as the visible label — it is a title-only tooltip", () => {
    const html = renderToStaticMarkup(
      <ConnectionBadge connected loading={false} t={t} title="http://127.0.0.1:3030" />
    );
    expect(html).toContain('title="http://127.0.0.1:3030"');
    expect(html).not.toMatch(/>127\.0\.0\.1:3030</);
  });
});
