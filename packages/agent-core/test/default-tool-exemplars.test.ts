import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOOL_EXEMPLAR_BANK,
  RUN_TOOL_PLAN_EXEMPLAR_BANK,
  renderToolExemplarSection,
  selectToolExemplars
} from "../src/index.js";

describe("DEFAULT_TOOL_EXEMPLAR_BANK", () => {
  it("preserves the exported run_tool_plan seed bank as its compatible prefix", () => {
    expect(DEFAULT_TOOL_EXEMPLAR_BANK.slice(0, RUN_TOOL_PLAN_EXEMPLAR_BANK.length)).toEqual(RUN_TOOL_PLAN_EXEMPLAR_BANK);
  });

  it("selects and renders browser_look for a Korean visual-chart paraphrase", () => {
    const selected = selectToolExemplars(
      "이 페이지에 있는 그래프가 뭘 보여주는지 설명해줘",
      DEFAULT_TOOL_EXEMPLAR_BANK,
      3
    );
    expect(selected[0]?.tool).toBe("browser_look");
    expect(renderToolExemplarSection(selected)).toContain("browser_look");
  });

  it("selects browser_read restraint for a Korean page-text paraphrase", () => {
    const selected = selectToolExemplars(
      "현재 페이지 본문 텍스트만 읽어서 알려줘",
      DEFAULT_TOOL_EXEMPLAR_BANK,
      3
    );
    expect(selected[0]?.tool).toBe("browser_read");
  });

  it("selects the relevant no-tool exemplar for a future-contact musing", () => {
    const selected = selectToolExemplars(
      "I may add Sam to Contacts later, but I am just thinking about it",
      DEFAULT_TOOL_EXEMPLAR_BANK,
      3
    );
    expect(selected[0]?.tool).toBeNull();
    expect(renderToolExemplarSection(selected)).toContain("(no tool — answered directly)");
  });

  it("selects mac_app_read for an explicit existing-contact lookup", () => {
    const selected = selectToolExemplars(
      "Find Jane's email in Contacts now",
      DEFAULT_TOOL_EXEMPLAR_BANK,
      3
    );
    expect(selected[0]?.tool).toBe("mac_app_read");
  });

  it("does not inject any exemplar for an unrelated prompt", () => {
    const selected = selectToolExemplars(
      "Explain quantum entanglement using a simple analogy",
      DEFAULT_TOOL_EXEMPLAR_BANK,
      3
    );
    expect(selected).toEqual([]);
    expect(renderToolExemplarSection(selected)).toBe("");
  });

  it("keeps the dashboard-trend held-out prompt lexically disjoint from the default bank", () => {
    expect(selectToolExemplars(
      "이 대시보드 매출 추세가 뭘 뜻하는지 봐줘.",
      DEFAULT_TOOL_EXEMPLAR_BANK,
      3
    )).toEqual([]);
  });
});
