import CoreGraphics

/// Which display a window should open on. `mouse` = the screen the user is
/// acting on (good for day-to-day); `main` = the menu-bar screen (predictable,
/// used under test mode so screenshots are reproducible).
public enum WindowDisplayChoice: Equatable {
    case main
    case mouse
}

/// Pure, AppKit-free window-placement policy so it is unit-testable without a
/// running window server. The AppKit glue (`WindowPlacer`) reads the environment,
/// resolves the actual `NSScreen`, and applies these decisions.
///
/// Env knobs (make the desktop app deterministic to drive + screenshot):
/// - `MUSE_DESKTOP_TEST=1` — test mode: force every window to the MAIN display,
///   centered, and re-show first-run surfaces so they can be captured repeatedly.
/// - `MUSE_WINDOW_DISPLAY=main|mouse` — pick the display (default `mouse`; test
///   mode forces `main`).
/// - `MUSE_WINDOW_ORIGIN=x,y` — pin the window's bottom-left origin to exact
///   screen coordinates (overrides centering) for pixel-deterministic tests.
public enum WindowPlacement {
    /// True when the desktop app is in deterministic test mode.
    public static func isTestMode(_ env: [String: String]) -> Bool {
        switch env["MUSE_DESKTOP_TEST"]?.lowercased() {
        case "1", "true", "yes", "on": return true
        default: return false
        }
    }

    /// Which display to place windows on. Test mode pins `main` so a captured
    /// window is always on the same, predictable screen.
    public static func displayChoice(_ env: [String: String]) -> WindowDisplayChoice {
        if isTestMode(env) { return .main }
        return env["MUSE_WINDOW_DISPLAY"]?.lowercased() == "main" ? .main : .mouse
    }

    /// The origin (bottom-left, screen coords) that centers a `windowSize` window
    /// inside a screen's `visibleFrame`. Pure so it is unit-testable.
    public static func centeredOrigin(inVisibleFrame f: CGRect, windowSize s: CGSize) -> CGPoint {
        CGPoint(x: f.midX - s.width / 2, y: f.midY - s.height / 2)
    }

    /// An explicit `MUSE_WINDOW_ORIGIN=x,y` override, or nil when unset/malformed.
    public static func explicitOrigin(_ env: [String: String]) -> CGPoint? {
        guard let raw = env["MUSE_WINDOW_ORIGIN"]?.trimmingCharacters(in: .whitespaces),
              !raw.isEmpty else { return nil }
        let parts = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2, let x = Double(parts[0]), let y = Double(parts[1]) else { return nil }
        return CGPoint(x: x, y: y)
    }
}
