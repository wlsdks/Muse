import { describe, expect, it } from "vitest";

import { convertUnit, detectUnitConversion, formatConversion } from "./unit-conversion.js";

describe("convertUnit — factor + temperature, dimension-checked", () => {
  it("converts length / mass / volume by factor", () => {
    expect(convertUnit(5, "mi", "km")).toBeCloseTo(8.04672, 3);
    expect(convertUnit(1, "kg", "lb")).toBeCloseTo(2.20462, 3);
    expect(convertUnit(2, "l", "ml")).toBe(2000);
    expect(convertUnit(12, "in", "cm")).toBeCloseTo(30.48, 2);
  });

  it("converts temperature by formula (not factor)", () => {
    expect(convertUnit(100, "f", "c")).toBeCloseTo(37.7778, 3);
    expect(convertUnit(0, "c", "f")).toBe(32);
    expect(convertUnit(0, "c", "k")).toBeCloseTo(273.15, 2);
  });

  it("returns null for an unknown unit or a cross-dimension request", () => {
    expect(convertUnit(5, "mi", "kg")).toBeNull();   // length → mass
    expect(convertUnit(5, "apples", "oranges")).toBeNull();
    expect(convertUnit(5, "mi", "celsius")).toBeNull();
  });
});

describe("detectUnitConversion — only a real conversion short-circuits", () => {
  it("parses 'how many <to> in <N> <from>'", () => {
    expect(detectUnitConversion("how many km in 5 miles?")).toEqual({ from: "miles", to: "km", value: 5 });
    expect(detectUnitConversion("how much cm in 12 inches")).toEqual({ from: "inches", to: "cm", value: 12 });
  });

  it("parses '<N> <from> in/to <to>' with optional convert/what's", () => {
    expect(detectUnitConversion("what's 100F in C?")).toEqual({ from: "f", to: "c", value: 100 });
    expect(detectUnitConversion("convert 5 miles to km")).toEqual({ from: "miles", to: "km", value: 5 });
    expect(detectUnitConversion("2.5 kg in lb")).toEqual({ from: "kg", to: "lb", value: 2.5 });
  });

  it("returns null for non-conversion questions (recall is never hijacked)", () => {
    expect(detectUnitConversion("how many days in a week?")).toBeNull();      // time units not supported
    expect(detectUnitConversion("what's my budget in dollars?")).toBeNull();  // unknown units
    expect(detectUnitConversion("how many people are coming?")).toBeNull();
    expect(detectUnitConversion("convert 5 miles to kg")).toBeNull();         // cross-dimension
  });
});

describe("formatConversion", () => {
  it("rounds sensibly and echoes the user's unit words", () => {
    expect(formatConversion(5, "miles", "km", 8.04672)).toBe("5 miles = 8.05 km.");
    expect(formatConversion(100, "f", "c", 37.7778)).toBe("100 f = 37.78 c.");
    expect(formatConversion(2, "l", "ml", 2000)).toBe("2 l = 2000 ml.");
  });
});
