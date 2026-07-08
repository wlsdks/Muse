import AppKit
import MuseDesktopCore

/// Single, predictable placement for every Muse window (onboarding, full app,
/// settings). Replaces per-window `win.center()` / bespoke centering so the app
/// is deterministic to drive and screenshot. Policy is decided by the pure
/// `WindowPlacement` (env-driven); this glue resolves the real `NSScreen` and
/// applies it.
enum WindowPlacer {
    static var isTestMode: Bool { WindowPlacement.isTestMode(ProcessInfo.processInfo.environment) }

    /// Center `win` on the chosen display (or pin it to `MUSE_WINDOW_ORIGIN`).
    static func place(_ win: NSWindow) {
        let env = ProcessInfo.processInfo.environment
        if let origin = WindowPlacement.explicitOrigin(env) {
            win.setFrameOrigin(origin)
            return
        }
        guard let visible = screen(for: env)?.visibleFrame else { win.center(); return }
        win.setFrameOrigin(WindowPlacement.centeredOrigin(inVisibleFrame: visible, windowSize: win.frame.size))
    }

    private static func screen(for env: [String: String]) -> NSScreen? {
        switch WindowPlacement.displayChoice(env) {
        case .main:
            // The PRIMARY (menu-bar) screen is the one containing the global
            // origin (0,0) — NOT `NSScreen.main`, which is merely the screen of
            // whatever window is currently key (circular, and lands on the wrong
            // display in a multi-monitor setup).
            return NSScreen.screens.first { $0.frame.contains(CGPoint.zero) } ?? NSScreen.screens.first ?? NSScreen.main
        case .mouse:
            let mouse = NSEvent.mouseLocation
            return NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        }
    }
}
