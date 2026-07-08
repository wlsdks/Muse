/**
 * Process-wide CLI UX context — the tiny shared signal every command,
 * spinner, and formatter reads to honour the global `--quiet`,
 * `--no-input`, and `--no-color` flags without threading them through
 * ~80 command registrations.
 *
 * clig.dev grounding:
 *   - `--quiet` suppresses non-essential human chatter (tips, spinners)
 *     while primary output + errors keep flowing.
 *   - `--no-input` means "never prompt" — take the safe non-interactive
 *     default instead of blocking on a TTY prompt.
 *   - `--no-color` is one of several colour signals `colorAllowed` reads
 *     (see tty-color.ts for the full precedence).
 *
 * The module is a small mutable singleton on purpose: the commander
 * pre-action hook populates it once from parsed global options, and any
 * deeply-nested renderer reads it via the getters. Kept pure + reset-able
 * so tests never leak state between cases.
 */

export interface CliContext {
  /** `--quiet` / `-q`: suppress tips, spinners, and other non-essential chatter. */
  readonly quiet: boolean;
  /** `--no-input`: never prompt; take the safe non-interactive default. */
  readonly noInput: boolean;
  /** `--no-color`: caller asked to disable ANSI colour (one of several signals). */
  readonly noColor: boolean;
}

const DEFAULTS: CliContext = { noColor: false, noInput: false, quiet: false };

const state: { current: CliContext } = { current: DEFAULTS };

/** Replace the whole context (used by the pre-action hook + tests). */
export function setCliContext(next: CliContext): void {
  state.current = next;
}

/** Merge a partial update over the current context. */
export function updateCliContext(patch: Partial<CliContext>): void {
  state.current = { ...state.current, ...patch };
}

/** Snapshot of the current context (a copy — callers can't mutate the singleton). */
export function getCliContext(): CliContext {
  return { ...state.current };
}

/** Reset to defaults — call in test `beforeEach`/`afterEach` to avoid state bleed. */
export function resetCliContext(): void {
  state.current = DEFAULTS;
}

/** True when `--quiet`/`-q` is active — gate spinner starts + tip lines on `!isQuiet()`. */
export function isQuiet(): boolean {
  return state.current.quiet;
}

/** True when `--no-input` is active — prompts must take the safe default, never block. */
export function isNoInput(): boolean {
  return state.current.noInput;
}

/** True when `--no-color` was requested — read by `colorAllowed`. */
export function isColorDisabled(): boolean {
  return state.current.noColor;
}

/**
 * Shape of the parsed global options the root program exposes. Every field is
 * optional so a partial (or a test literal) maps cleanly. commander negatable
 * options invert: `--no-color` → `color:false`, `--no-input` → `input:false`.
 */
export interface CliGlobalOptions {
  readonly color?: boolean;
  readonly input?: boolean;
  readonly quiet?: boolean;
}

/**
 * Derive the CLI context from parsed global options. Pure — env / TTY
 * implication is applied by the caller (non-TTY already implies no-input at
 * the prompt layer). Absent flags map to today's behaviour (all false), so a
 * plain invocation is unchanged.
 */
export function cliContextFromGlobals(opts: CliGlobalOptions): CliContext {
  return {
    noColor: opts.color === false,
    noInput: opts.input === false,
    quiet: opts.quiet === true
  };
}
