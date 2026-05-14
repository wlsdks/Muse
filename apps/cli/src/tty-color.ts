/**
 * Goal 061 — tiny ANSI helper for the TTY-aware coloured output
 * on `muse today` and friends. Avoids a chalk / picocolors dep —
 * the surface we need is small (red / yellow / green / bold) and
 * a hand-rolled wrapper keeps the helper auditable.
 *
 * Behaviour matrix:
 *
 *   NO_COLOR set (any value)        → never colour (always wins)
 *   `force: true`                   → colour regardless of TTY (tests)
 *   process.stdout.isTTY === true   → colour
 *   process.stdout.isTTY undefined  → never colour (piped / CI)
 *
 * Returns the wrapped string when colour is active, the raw
 * string otherwise — callers don't have to branch.
 */

export interface AnsiOptions {
  /** Override the TTY probe — useful for tests. */
  readonly isTty?: boolean;
  /** Force colour on even when isTty is false (rare; used in golden tests). */
  readonly force?: boolean;
}

const RESET = "\x1b[0m";
const COLORS: Readonly<Record<string, string>> = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m"
};

/**
 * Decide whether colour output is currently allowed. Centralised
 * here so individual formatters call `if (!colorAllowed(...))` at
 * most once per render instead of duplicating the policy.
 */
export function colorAllowed(options: AnsiOptions = {}): boolean {
  // NO_COLOR wins unconditionally (https://no-color.org/).
  if (process.env.NO_COLOR !== undefined) return false;
  if (options.force) return true;
  return options.isTty ?? process.stdout.isTTY === true;
}

/**
 * Wrap `value` in the named ANSI sequence when colour is active,
 * otherwise return it unchanged. Unknown color names pass through
 * untouched so a typo doesn't crash a render.
 */
export function colorize(value: string, color: keyof typeof COLORS, options: AnsiOptions = {}): string {
  if (!colorAllowed(options)) return value;
  const code = COLORS[color];
  if (!code) return value;
  return `${code}${value}${RESET}`;
}
