import AppKit
import MuseDesktopCore

enum HexColor {
    /// Parse "#rgb", "#rrggbb", or "#rrggbbaa" (and the alpha-zero "#00000000"
    /// transparent convention) into an NSColor. Returns nil for unparseable or
    /// fully-transparent values so the renderer simply skips that cell. The parse
    /// itself lives in MuseDesktopCore (`parseHexColor`) so it's headless-tested.
    static func parse(_ hex: String) -> NSColor? {
        guard let c = parseHexColor(hex), c.a != 0 else { return nil } // transparent ⇒ skip the cell
        return NSColor(calibratedRed: c.r, green: c.g, blue: c.b, alpha: c.a)
    }
}
