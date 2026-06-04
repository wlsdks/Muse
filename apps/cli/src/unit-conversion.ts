/**
 * `muse ask`'s pure unit-conversion fast-path — the third deterministic
 * "compute it, don't let the 8B guess" lever (after arithmetic and dates). The
 * local model is unreliable at unit conversion (especially temperature, which
 * needs a formula not a factor), so a query that is nothing but a conversion
 * ("how many km in 5 miles?", "what's 100F in C?") is answered EXACTLY here.
 * Precision-first: a conversion only fires when BOTH units are known AND in the
 * same dimension, so a non-conversion question falls through to normal recall.
 */

const FACTOR_UNITS: Record<string, { readonly dim: string; readonly factor: number }> = {};
function registerFactor(dim: string, factor: number, ...aliases: readonly string[]): void {
  for (const alias of aliases) {
    FACTOR_UNITS[alias] = { dim, factor };
  }
}
// factor = how many BASE units (m / g / l) one of this unit is.
registerFactor("length", 1, "m", "meter", "meters", "metre", "metres");
registerFactor("length", 1000, "km", "kilometer", "kilometers", "kilometre", "kilometres");
registerFactor("length", 0.01, "cm", "centimeter", "centimeters");
registerFactor("length", 0.001, "mm", "millimeter", "millimeters");
registerFactor("length", 1609.344, "mi", "mile", "miles");
registerFactor("length", 0.9144, "yd", "yard", "yards");
registerFactor("length", 0.3048, "ft", "foot", "feet");
registerFactor("length", 0.0254, "in", "inch", "inches");
registerFactor("mass", 1, "g", "gram", "grams");
registerFactor("mass", 1000, "kg", "kilogram", "kilograms");
registerFactor("mass", 0.001, "mg", "milligram", "milligrams");
registerFactor("mass", 453.59237, "lb", "lbs", "pound", "pounds");
registerFactor("mass", 28.349523, "oz", "ounce", "ounces");
registerFactor("mass", 6350.29318, "st", "stone", "stones");
registerFactor("volume", 1, "l", "liter", "liters", "litre", "litres");
registerFactor("volume", 0.001, "ml", "milliliter", "milliliters");
registerFactor("volume", 3.785412, "gal", "gallon", "gallons");
registerFactor("volume", 0.946353, "qt", "quart", "quarts");
registerFactor("volume", 0.473176, "pt", "pint", "pints");
registerFactor("volume", 0.236588, "cup", "cups");

const TEMP_UNITS: Record<string, "c" | "f" | "k"> = {
  c: "c", celsius: "c", "°c": "c", centigrade: "c",
  f: "f", fahrenheit: "f", "°f": "f",
  k: "k", kelvin: "k"
};

function convertTemp(value: number, from: "c" | "f" | "k", to: "c" | "f" | "k"): number {
  const celsius = from === "c" ? value : from === "f" ? (value - 32) * 5 / 9 : value - 273.15;
  return to === "c" ? celsius : to === "f" ? celsius * 9 / 5 + 32 : celsius + 273.15;
}

/** Convert `value` from `from` to `to`; null if either unit is unknown or they're different dimensions. Pure. */
export function convertUnit(value: number, from: string, to: string): number | null {
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  const ff = FACTOR_UNITS[f];
  const ft = FACTOR_UNITS[t];
  if (ff && ft && ff.dim === ft.dim) {
    return value * ff.factor / ft.factor;
  }
  const tf = TEMP_UNITS[f];
  const tt = TEMP_UNITS[t];
  if (tf && tt) {
    return convertTemp(value, tf, tt);
  }
  return null;
}

const NUM = "(-?\\d+(?:\\.\\d+)?)";
const UNIT = "([a-z°]+)";
const PATTERN_A = new RegExp(`(?:how\\s+many|how\\s+much)\\s+${UNIT}\\s+(?:in|is|are|per|to)\\s+${NUM}\\s*${UNIT}`, "u");
const PATTERN_B = new RegExp(`(?:convert|what(?:'s|s|\\s+is)?)?\\s*${NUM}\\s*${UNIT}\\s+(?:in|to|into|as|=)\\s+${UNIT}`, "u");

/**
 * Detect a pure unit-conversion question and return `{ value, from, to }`, or
 * null. Handles "how many <to> in <N> <from>" and "<N> <from> in/to <to>"
 * (with an optional "convert"/"what's"). Returns null unless BOTH units convert
 * (known + same dimension), so a non-conversion query never short-circuits.
 */
export function detectUnitConversion(query: string): { readonly value: number; readonly from: string; readonly to: string } | null {
  const q = query.trim().toLowerCase().replace(/[?.!]+$/u, "");
  const a = PATTERN_A.exec(q);
  if (a && convertUnit(Number(a[2]), a[3]!, a[1]!) !== null) {
    return { from: a[3]!, to: a[1]!, value: Number(a[2]) };
  }
  const b = PATTERN_B.exec(q);
  if (b && convertUnit(Number(b[1]), b[2]!, b[3]!) !== null) {
    return { from: b[2]!, to: b[3]!, value: Number(b[1]) };
  }
  return null;
}

/** "5 miles = 8.05 km." — result rounded to a sensible precision. Pure. */
export function formatConversion(value: number, from: string, to: string, result: number): string {
  const rounded = Math.abs(result) >= 100 ? Math.round(result * 10) / 10 : Math.round(result * 100) / 100;
  return `${value.toString()} ${from} = ${rounded.toString()} ${to}.`;
}
