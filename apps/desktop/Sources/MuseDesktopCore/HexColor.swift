import Foundation

/// A parsed colour as components in 0...1. Pure (no AppKit) so the sprite
/// renderer's hex contract is headless-testable; the AppKit `HexColor` builds an
/// NSColor from this.
public struct RGBA: Equatable, Sendable {
    public let r: Double
    public let g: Double
    public let b: Double
    public let a: Double
    public init(r: Double, g: Double, b: Double, a: Double) {
        self.r = r; self.g = g; self.b = b; self.a = a
    }
}

/// Parse "#rgb", "#rrggbb", or "#rrggbbaa" (the leading "#" optional, whitespace
/// trimmed) into components. Returns nil only for an unparseable value or a
/// length that isn't 3/6/8 — a fully-transparent "#00000000" is a VALID colour
/// here (a==0); whether to SKIP that cell is the renderer's decision, not the
/// parser's.
public func parseHexColor(_ hex: String) -> RGBA? {
    var s = hex.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    guard let value = UInt64(s, radix: 16) else { return nil }
    switch s.count {
    case 3:
        return RGBA(r: Double((value >> 8) & 0xF) / 15, g: Double((value >> 4) & 0xF) / 15, b: Double(value & 0xF) / 15, a: 1)
    case 6:
        return RGBA(r: Double((value >> 16) & 0xFF) / 255, g: Double((value >> 8) & 0xFF) / 255, b: Double(value & 0xFF) / 255, a: 1)
    case 8:
        return RGBA(r: Double((value >> 24) & 0xFF) / 255, g: Double((value >> 16) & 0xFF) / 255, b: Double((value >> 8) & 0xFF) / 255, a: Double(value & 0xFF) / 255)
    default:
        return nil
    }
}
