import { afterEach, describe, expect, it } from "vitest";

import {
  cliContextFromGlobals,
  getCliContext,
  isColorDisabled,
  isNoInput,
  isQuiet,
  resetCliContext,
  setCliContext,
  updateCliContext
} from "./cli-context.js";

describe("cli-context — get/set/reset", () => {
  afterEach(() => {
    resetCliContext();
  });

  it("defaults to all-off (today's behaviour, no regression)", () => {
    expect(getCliContext()).toEqual({ noColor: false, noInput: false, quiet: false });
    expect(isQuiet()).toBe(false);
    expect(isNoInput()).toBe(false);
    expect(isColorDisabled()).toBe(false);
  });

  it("setCliContext replaces the whole context", () => {
    setCliContext({ noColor: true, noInput: true, quiet: true });
    expect(isQuiet()).toBe(true);
    expect(isNoInput()).toBe(true);
    expect(isColorDisabled()).toBe(true);
  });

  it("updateCliContext merges a partial patch", () => {
    updateCliContext({ quiet: true });
    expect(isQuiet()).toBe(true);
    expect(isNoInput()).toBe(false);
    updateCliContext({ noInput: true });
    expect(isQuiet()).toBe(true);
    expect(isNoInput()).toBe(true);
  });

  it("resetCliContext restores defaults (no state bleed between tests)", () => {
    setCliContext({ noColor: true, noInput: true, quiet: true });
    resetCliContext();
    expect(getCliContext()).toEqual({ noColor: false, noInput: false, quiet: false });
  });

  it("getCliContext returns a copy — callers cannot mutate the singleton", () => {
    const snapshot = getCliContext() as { quiet: boolean };
    snapshot.quiet = true;
    expect(isQuiet()).toBe(false);
  });
});

describe("cliContextFromGlobals — maps parsed commander opts (negatable invert)", () => {
  it("--no-color → color:false → noColor:true", () => {
    expect(cliContextFromGlobals({ color: false })).toMatchObject({ noColor: true });
  });

  it("--no-input → input:false → noInput:true", () => {
    expect(cliContextFromGlobals({ input: false })).toMatchObject({ noInput: true });
  });

  it("-q/--quiet → quiet:true", () => {
    expect(cliContextFromGlobals({ quiet: true })).toMatchObject({ quiet: true });
  });

  it("absent flags map to all-off (commander defaults color/input true)", () => {
    expect(cliContextFromGlobals({ color: true, input: true })).toEqual({
      noColor: false,
      noInput: false,
      quiet: false
    });
    expect(cliContextFromGlobals({})).toEqual({ noColor: false, noInput: false, quiet: false });
  });
});
