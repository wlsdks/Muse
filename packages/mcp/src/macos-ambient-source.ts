/**
 * macOS active-window ambient source — true continuous perception
 * (P20): reads the frontmost app + window title live via `osascript`
 * so the ambient notice loop perceives the desktop WITHOUT the user
 * (or a launchd helper) writing `~/.muse/ambient.json`. Read-only.
 *
 * The osascript spawn is injected (`run`) so the deterministic parse +
 * fail-open behaviour is exercised against contract-faithful output,
 * never a real process in tests. Any failure (no Accessibility
 * permission, no frontmost app, a wedged spawn) yields `undefined` —
 * never throws — so a perception blip can't crash the tick.
 */

import { execFile } from "node:child_process";

import type { AmbientSignal, AmbientSignalSource } from "./ambient-notice-loop.js";

const ACTIVE_WINDOW_SCRIPT = [
  'tell application "System Events"',
  "  set frontApp to name of first application process whose frontmost is true",
  "end tell",
  'set winTitle to ""',
  "try",
  "  tell application \"System Events\" to tell (first application process whose frontmost is true)",
  "    set winTitle to name of front window",
  "  end tell",
  "end try",
  'return frontApp & "\n" & winTitle'
].join("\n");

/**
 * Parse `osascript` output (`app` on line 1, window title on line 2)
 * into an `AmbientSignal`. Returns `undefined` when no frontmost app
 * could be read (empty output) so the loop stays quiet rather than
 * matching on a blank signal.
 */
export function parseActiveWindowSignal(stdout: string | undefined): AmbientSignal | undefined {
  if (stdout === undefined) {
    return undefined;
  }
  const lines = stdout.split("\n").map((line) => line.trim());
  const app = lines[0] ?? "";
  if (app.length === 0) {
    return undefined;
  }
  const window = (lines[1] ?? "").trim();
  return window.length > 0 ? { app, window } : { app };
}

export interface MacOsActiveWindowSourceOptions {
  /** Injectable osascript runner (returns stdout, or undefined on failure). Default spawns `osascript`. */
  readonly run?: (script: string) => Promise<string | undefined>;
  readonly osascriptPath?: string;
  /** Hard wall-clock cap for the spawn. Default 3000ms. */
  readonly timeoutMs?: number;
}

export class MacOsActiveWindowSource implements AmbientSignalSource {
  private readonly run: (script: string) => Promise<string | undefined>;

  constructor(options: MacOsActiveWindowSourceOptions = {}) {
    const osascriptPath = options.osascriptPath ?? "/usr/bin/osascript";
    const timeoutMs = options.timeoutMs ?? 3_000;
    this.run = options.run ?? ((script) => defaultOsascriptRun(osascriptPath, script, timeoutMs));
  }

  async snapshot(): Promise<AmbientSignal | undefined> {
    let stdout: string | undefined;
    try {
      stdout = await this.run(ACTIVE_WINDOW_SCRIPT);
    } catch {
      return undefined;
    }
    return parseActiveWindowSignal(stdout);
  }
}

function defaultOsascriptRun(osascriptPath: string, script: string, timeoutMs: number): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    execFile(osascriptPath, ["-e", script], { timeout: timeoutMs }, (error, stdout) => {
      resolve(error ? undefined : stdout);
    });
  });
}
