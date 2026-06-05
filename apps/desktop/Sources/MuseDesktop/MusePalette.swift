import AppKit

/// The colour for each `MuseSprite` legend character. Shared by the live
/// `CharacterView` and the headless `SpriteRenderer` so the preview matches
/// exactly what the window shows.
enum MusePalette {
    static let colors: [Character: NSColor] = [
        "H": NSColor(calibratedRed: 0.42, green: 0.24, blue: 0.16, alpha: 1), // auburn hair
        "h": NSColor(calibratedRed: 0.60, green: 0.36, blue: 0.22, alpha: 1), // hair highlight
        "F": NSColor(calibratedRed: 0.96, green: 0.80, blue: 0.66, alpha: 1), // skin
        "e": NSColor(calibratedRed: 0.20, green: 0.16, blue: 0.22, alpha: 1), // eyes
        "k": NSColor(calibratedRed: 0.93, green: 0.62, blue: 0.60, alpha: 1), // blush
        "m": NSColor(calibratedRed: 0.78, green: 0.34, blue: 0.38, alpha: 1), // lips
        "G": NSColor(calibratedRed: 0.90, green: 0.74, blue: 0.36, alpha: 1), // gold laurel
        "D": NSColor(calibratedRed: 0.96, green: 0.93, blue: 0.86, alpha: 1), // dress
        "d": NSColor(calibratedRed: 0.82, green: 0.78, blue: 0.70, alpha: 1)  // dress shadow
    ]

    static func color(for ch: Character) -> NSColor? { colors[ch] }
}
