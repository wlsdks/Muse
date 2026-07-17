import { describe, expect, it } from "vitest";

import {
  buildFlowDraftPrompt,
  buildFlowDraftRepairPrompt,
  buildFlowDraftRevisionPrompt,
  buildFlowDraftRevisionRepairPrompt,
  parseCurrentDraftInput,
  parseFlowDraftResponse
} from "./flows-draft-compile.js";

import type { FlowDraftPayload } from "./flows-draft-compile.js";

const SAMPLE_DRAFT: FlowDraftPayload = {
  cronExpression: "0 9 * * *",
  name: "아침 브리핑",
  notifyChannel: null,
  prompt: "오늘 일정을 요약해서 알려줘",
  retry: false
};

describe("buildFlowDraftPrompt / buildFlowDraftRepairPrompt", () => {
  it("carries the exact schema + both KO/EN few-shot examples in the system prompt", () => {
    const prompt = buildFlowDraftPrompt("매일 아침 9시에 일정 요약해서 알려줘");
    expect(prompt.system).toContain("cronExpression");
    expect(prompt.system).toContain("notifyChannel");
    expect(prompt.system).toContain("매일 아침 9시에 일정 요약해서 알려줘");
    expect(prompt.system).toContain("every monday at 9am");
    expect(prompt.user).toContain("매일 아침 9시에 일정 요약해서 알려줘");
  });

  it("the repair prompt echoes the prior raw answer + the validation error", () => {
    const prompt = buildFlowDraftRepairPrompt("daily standup at 9am", '{"name":"x"}', "cronExpression must be a 5-field cron expression");
    expect(prompt.user).toContain("cronExpression must be a 5-field cron expression");
    expect(prompt.user).toContain('{"name":"x"}');
    expect(prompt.user).toContain("daily standup at 9am");
  });
});

describe("parseFlowDraftResponse", () => {
  it("parses a clean JSON object", () => {
    const raw = '{"name": "아침 일정 요약", "cronExpression": "0 9 * * *", "prompt": "오늘 일정을 요약해서 알려줘", "notifyChannel": null, "retry": false}';
    const result = parseFlowDraftResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        cronExpression: "0 9 * * *",
        name: "아침 일정 요약",
        notifyChannel: null,
        prompt: "오늘 일정을 요약해서 알려줘",
        retry: false
      });
    }
  });

  it("extracts the JSON object out of surrounding prose", () => {
    const raw = `Sure, here's the draft:\n{"name": "Weekly summary", "cronExpression": "0 9 * * 1", "prompt": "Summarize my week", "notifyChannel": "telegram:555", "retry": true}\nLet me know if you'd like changes.`;
    const result = parseFlowDraftResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cronExpression).toBe("0 9 * * 1");
      expect(result.value.notifyChannel).toBe("telegram:555");
      expect(result.value.retry).toBe(true);
    }
  });

  it("defaults a missing notifyChannel/retry to null/false", () => {
    const raw = '{"name": "Morning brief", "cronExpression": "0 9 * * *", "prompt": "summarize my day"}';
    const result = parseFlowDraftResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.notifyChannel).toBeNull();
      expect(result.value.retry).toBe(false);
    }
  });

  it("rejects a response with no JSON object at all", () => {
    const result = parseFlowDraftResponse("Sorry, I can't help with that.");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("JSON object");
    }
  });

  it("rejects a non-5-field cron expression", () => {
    const raw = '{"name": "x", "cronExpression": "9 * * *", "prompt": "y"}';
    const result = parseFlowDraftResponse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("cronExpression");
    }
  });

  it("rejects a 5-field-shaped but semantically invalid cron expression", () => {
    const raw = '{"name": "x", "cronExpression": "99 99 99 99 99", "prompt": "y"}';
    const result = parseFlowDraftResponse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("cronExpression");
    }
  });

  it("rejects a blank name or prompt", () => {
    const noName = parseFlowDraftResponse('{"name": "  ", "cronExpression": "0 9 * * *", "prompt": "y"}');
    expect(noName.ok).toBe(false);
    const noPrompt = parseFlowDraftResponse('{"name": "x", "cronExpression": "0 9 * * *", "prompt": ""}');
    expect(noPrompt.ok).toBe(false);
  });

  it("with requireAllFields, accepts a response that literally carries a null notifyChannel", () => {
    const raw = '{"name": "x", "cronExpression": "0 9 * * *", "prompt": "y", "notifyChannel": null, "retry": false}';
    const result = parseFlowDraftResponse(raw, { requireAllFields: true });
    expect(result.ok).toBe(true);
  });

  it("with requireAllFields, rejects a response that DROPS notifyChannel entirely (never silently defaults it)", () => {
    const raw = '{"name": "x", "cronExpression": "0 9 * * *", "prompt": "y", "retry": false}';
    const result = parseFlowDraftResponse(raw, { requireAllFields: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("notifyChannel");
    }
  });

  it("with requireAllFields, rejects a response that DROPS retry entirely", () => {
    const raw = '{"name": "x", "cronExpression": "0 9 * * *", "prompt": "y", "notifyChannel": null}';
    const result = parseFlowDraftResponse(raw, { requireAllFields: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("retry");
    }
  });

  it("without requireAllFields (the first-draft path), a missing notifyChannel/retry still defaults, unchanged behavior", () => {
    const raw = '{"name": "x", "cronExpression": "0 9 * * *", "prompt": "y"}';
    const result = parseFlowDraftResponse(raw);
    expect(result.ok).toBe(true);
  });
});

describe("buildFlowDraftRevisionPrompt / buildFlowDraftRevisionRepairPrompt", () => {
  it("carries the current draft JSON, the schema, and both KO/EN revision few-shots", () => {
    const prompt = buildFlowDraftRevisionPrompt("8시 반으로 바꿔줘", SAMPLE_DRAFT);
    expect(prompt.system).toContain("FULL updated JSON");
    expect(prompt.system).toContain("notifyChannel");
    expect(prompt.system).toContain("30 8 * * *");
    expect(prompt.system).toContain("telegram:123");
    expect(prompt.user).toContain(JSON.stringify(SAMPLE_DRAFT));
    expect(prompt.user).toContain("8시 반으로 바꿔줘");
  });

  it("the revision repair prompt echoes the current draft again + the prior raw answer + the validation error", () => {
    const prompt = buildFlowDraftRevisionRepairPrompt(
      "텔레그램 123으로도 보내줘",
      SAMPLE_DRAFT,
      '{"name":"아침 브리핑"}',
      "revision response is missing required field 'retry'"
    );
    expect(prompt.user).toContain(JSON.stringify(SAMPLE_DRAFT));
    expect(prompt.user).toContain("텔레그램 123으로도 보내줘");
    expect(prompt.user).toContain("revision response is missing required field 'retry'");
    expect(prompt.user).toContain('{"name":"아침 브리핑"}');
  });
});

describe("parseCurrentDraftInput", () => {
  const VALID = {
    cronExpression: "0 9 * * *",
    name: "아침 브리핑",
    notifyChannel: null,
    prompt: "오늘 일정을 요약해서 알려줘",
    retry: false
  };

  it("accepts the exact whitelisted 5-field shape", () => {
    const result = parseCurrentDraftInput(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(VALID);
    }
  });

  it("rejects a non-object (array, string, null, number)", () => {
    expect(parseCurrentDraftInput(null).ok).toBe(false);
    expect(parseCurrentDraftInput("nope").ok).toBe(false);
    expect(parseCurrentDraftInput(42).ok).toBe(false);
    expect(parseCurrentDraftInput([VALID]).ok).toBe(false);
  });

  it("rejects an unknown extra field rather than silently stripping it", () => {
    const result = parseCurrentDraftInput({ ...VALID, extraField: "sneaky" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("extraField");
    }
  });

  it("rejects a currentDraft missing a required key", () => {
    const { retry: _retry, ...withoutRetry } = VALID;
    const result = parseCurrentDraftInput(withoutRetry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("retry");
    }
  });

  it("rejects a wrong-typed field (retry as a string, cronExpression as a number)", () => {
    expect(parseCurrentDraftInput({ ...VALID, retry: "false" }).ok).toBe(false);
    expect(parseCurrentDraftInput({ ...VALID, cronExpression: 9 }).ok).toBe(false);
  });

  it("rejects an invalid (but 5-field-shaped) cron expression", () => {
    const result = parseCurrentDraftInput({ ...VALID, cronExpression: "99 99 99 99 99" });
    expect(result.ok).toBe(false);
  });

  it("normalizes a blank notifyChannel string to null", () => {
    const result = parseCurrentDraftInput({ ...VALID, notifyChannel: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.notifyChannel).toBeNull();
    }
  });
});
