# Windows integrations Phase 2 — `@muse/windows` design

**Date:** 2026-07-12 · **Branch:** `windows-integrations` (worktree `/tmp/muse-windows-phase2`)
**Approved scope:** 7 stock-PowerShell tools + the active-window ambient source.
**Verification:** windows-latest CI only (no physical Windows machine) — but unlike
Phase 1's macOS situation, the CI runner CAN execute real PowerShell, so
contract tests run against the real transport there.

## Goal

`@muse/windows` gives a Windows box the same native-actuator surface
`@muse/macos` gives a Mac, built exclusively on stock PowerShell (zero
third-party dependencies), registered dark-by-default behind
`MUSE_WINDOWS_ACTUATORS`, and reported honestly by `muse doctor`.

## Non-goals (explicitly deferred, with reasons)

- **Notes / Reminders mirrors** — Windows has no local system notes/reminders
  store; Microsoft To Do / Outlook require the Graph cloud API, which violates
  the local-first posture. Not a v1 target on principle, not just effort.
- **Contacts import** — Outlook COM works only when Outlook is installed and
  can't be exercised on the CI runner; Phase 2.5 candidate.
- **win_file_search / OCR screen_read / shortcut_run / message_send** — COM /
  WinRT boundaries or no OS analog; deferred.

## The v1 surface (names mirror the proven `mac_*` shapes)

| Tool | Does | Transport | Risk |
|---|---|---|---|
| `win_app_open` | open app / URL / file | `Start-Process` | write |
| `win_app_read` | battery / wifi / storage / frontmost window | `Get-CimInstance Win32_Battery`, `netsh wlan show interfaces`, `Get-PSDrive`, `GetForegroundWindow` (Add-Type) | read |
| `win_clipboard_set` | put text on the clipboard | `Set-Clipboard` | write |
| `win_say` | speak text aloud | `System.Speech.Synthesis.SpeechSynthesizer` | write (audio) |
| `win_screenshot` | capture screen to PNG | `System.Drawing` `CopyFromScreen` | write (file) |
| `win_media_control` | play/pause, next, previous | media-key events (`SendKeys`/keybd_event via Add-Type) | write |
| `win_system_set` | volume up/down/mute, display sleep | volume key events; `SendMessage(WM_SYSCOMMAND, SC_MONITORPOWER)` | write |

Plus **`WindowsActiveWindowSource`** in `@muse/proactivity` — the
`MacOsActiveWindowSource` counterpart: frontmost window title (+ optional
clipboard via the same opt-in flag), feeding the existing ambient-notice rules.

## Architecture

- **`packages/windows`** mirrors `packages/macos` file-for-file where the
  concept transfers:
  - `windows-exec.ts` — `WinPowerShellRunner` type + `defaultPowerShellRunner`:
    `execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", script])`
    with the same timeout-watchdog/stderr-capture contract as
    `defaultOsascriptRunner` (`OSASCRIPT_TIMEOUT_MS` analog
    `POWERSHELL_TIMEOUT_MS = 30_000`). Every tool takes the runner injected —
    the seam all unit tests fake.
  - One file per tool (`windows-app-open-tool.ts`, …), each exporting a
    `create*Tool(options)` returning a `MuseTool`, fail-soft error mapping
    (a missing subsystem → typed error string result, never a throw).
  - Screenshot path validation REUSES the macos-screen-path logic — lift
    `macos-screen-path.ts` into a shared helper if imports allow, else mirror
    its contract (allowed roots: tmp + `~/Desktop`-equivalent `~/Pictures`).
- **Registration** — `apps/cli/src/actuator-tools.ts` gains the win32 branch:
  `windowsActuatorsEnabled(env)` (`MUSE_WINDOWS_ACTUATORS`, same dark-by-default
  posture and truthy grammar as `macActuatorsEnabled`); arms the 7 tools on
  win32 only. `resolvePlatformCapabilities` returns
  `osIntegrations: "windows"` on win32 unconditionally — the seam reports what
  the OS OFFERS; the env flag decides ARMING, exactly as on macOS.
  Doctor's platform-posture line renders `os-integrations=windows (PowerShell
  actuators available; arm with MUSE_WINDOWS_ACTUATORS=true)`.
- **Ambient** — `packages/proactivity/src/windows-ambient-source.ts`,
  selected in the daemon when `MUSE_AMBIENT_SOURCE=windows` (mirror of the
  `macos` branch in `commands-daemon-register.ts`).

## Tool-calling reliability

Names are verb_noun, single-purpose, mirroring the `mac_*` set the local model
already selects reliably; schemas copy the mac tools' required/enum/example
patterns. HONEST LIMIT: `eval:tools` runs on the dev Mac where `win_*` tools
never register, so one-shot selection for these tools is unverified until a
real Windows box runs the eval; the mitigations are schema mirroring and the
shared confusable-set review (no name overlaps with existing tools).

## Testing (two layers)

1. **Fake-runner unit tests** (run everywhere): each tool's script
   construction (argv array, quoting, escaping), risk classification,
   fail-soft mapping, timeout kill — same style as `macos-tools.test.ts`.
2. **Real-PowerShell contract tests** (`describe.skipIf(platform !== "win32")`,
   run on the windows-latest runner): Set-Clipboard round-trip
   (`Get-Clipboard` reads back), `Win32_Battery`/`Get-PSDrive` real queries
   parse, screenshot actually writes a decodable PNG (the runner has a real
   desktop session), `win_say` synthesizes TO A WAV FILE (SpeechSynthesizer
   `SetOutputToWaveFile` — no audio device needed), app_open launches and
   kills a `notepad` process. Media/volume key events assert spawn success
   only (no observable state on a runner).
3. Ambient source: fake-runner unit tests + a real GetForegroundWindow call
   on the runner (asserts a non-throwing string-or-undefined contract, not a
   specific title).

## Security posture

Same rules as macOS: dark until `MUSE_WINDOWS_ACTUATORS=true`; every tool is
`risk: "write"` except `win_app_read`; the existing approval gate applies
unchanged; the PowerShell runner takes a SCRIPT VIA ARGV (no shell string
interpolation of user input — user text is passed as base64-encoded arguments
decoded inside the script where interpolation would otherwise be needed,
mirroring the AppleScript-escaping discipline).

## Risks

- CI runner variance (no audio device, service-session quirks): every
  real-transport assertion is written against observable, runner-safe effects
  (file exists, clipboard round-trip, process exit code) — nothing asserts
  audible/visible outcomes.
- Media/volume key semantics are unverifiable headlessly — those two tools
  ship with construction-level tests plus a README "CI-verified only" honesty
  note, same as Phase 1's audio.
- Concurrent loops keep moving main — same protocol as Phase 1: frequent
  `origin/main` merges, small pushed slices.
