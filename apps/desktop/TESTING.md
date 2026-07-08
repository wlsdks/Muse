# Driving & capturing the desktop app (for humans and agents)

The macOS app is a menu-bar (accessory) app, so its windows scatter across
displays and hide behind other apps — which makes it hard to observe. These two
knobs make it **predictable and self-testable**: launch it deterministically,
then capture any window's own buffer regardless of display or z-order.

## 1. Test mode — deterministic windows

`open -a Muse` does NOT pass environment variables, so launch the executable
directly:

```bash
MUSE_DESKTOP_TEST=1 /Applications/Muse.app/Contents/MacOS/MuseDesktop &
```

`MUSE_DESKTOP_TEST=1` makes every window land on the **main (menu-bar) display,
centered**, and **re-shows first-run onboarding on every launch** (so it can be
captured repeatedly without clearing `didOnboard`).

Related env knobs (see `MuseDesktopCore/WindowPlacement.swift`, unit-tested):

| Env | Effect |
| --- | --- |
| `MUSE_DESKTOP_TEST=1` | Main display, centered, onboarding always shows |
| `MUSE_WINDOW_DISPLAY=main\|mouse` | Pick the display (default `mouse`) |
| `MUSE_WINDOW_ORIGIN=x,y` | Pin a window's exact bottom-left origin (pixel-deterministic) |
| `MUSE_COMPANION_NO_MODEL=1` | Companion openers stay deterministic (no model call) |

## 2. `shot.sh` — capture one window, reliably

Captures a window's **own buffer** by CGWindowID (`screencapture -l`), so it works
even when the window is behind other apps or on a second display.

```bash
apps/desktop/scripts/shot.sh --list                 # idx | id | size | pos | name
apps/desktop/scripts/shot.sh --size 440x527 out.png # onboarding (by size)
apps/desktop/scripts/shot.sh --size 1200x820 out.png# full app
apps/desktop/scripts/shot.sh --index 2 out.png      # Nth window from --list
apps/desktop/scripts/shot.sh --id 70507 out.png     # explicit CGWindowID
```

Onboarding, the full app, and Settings all use the window title "Muse", so
disambiguate by **size** (they differ) — run `--list` first. Needs Screen
Recording permission for the controlling terminal (same as any `screencapture`).

## Typical loop

```bash
MUSE_DESKTOP_TEST=1 /Applications/Muse.app/Contents/MacOS/MuseDesktop &
sleep 2
apps/desktop/scripts/shot.sh --size 440x527 /tmp/onboarding.png   # inspect + judge
# edit Swift → swift build -c release → make-app.sh → reinstall → repeat
```
