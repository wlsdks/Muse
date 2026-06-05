import Foundation

/// The pixel-art Muse, authored as a palette-keyed grid (the data only — colour
/// + rendering live in the AppKit `CharacterView`, kept out of here so the
/// sprite stays headless-testable). She is a classical Muse bust: a laurel-
/// crowned woman with long flowing hair and a draped dress — feminine and
/// human, fitting the name, rather than a generic blob.
///
/// Legend: `.` transparent · `H` hair · `h` hair highlight · `F` skin ·
/// `e` eye · `k` blush · `m` lips · `G` gold (laurel / brooch) ·
/// `D` dress · `d` dress shadow.
public enum MuseSprite {
    public static let rows: [String] = [
        "....HHHHHH....",
        "..HHHHHHHHHH..",
        ".HHGGGGGGGGHH.",
        ".HHhFFFFFFhHH.",
        "HHhFFFFFFFFhHH",
        "HHFFeFFFFeFFHH",
        "HHFFFFFFFFFFHH",
        "HHFkFFFFFFkFHH",
        "HHFFFFmmFFFFHH",
        ".HHFFFFFFFFHH.",
        "..HHFFFFFFHH..",
        "...HH.FF.HH...",
        ".HHDDDGGDDDHH.",
        "HHDDDdddDDDDHH",
        "HHDDDDDDDDDDHH",
        ".HHDDDDDDDDHH."
    ]

    /// Row 5 carries the eyes; blink swaps it for all-skin (closed lids).
    public static let eyeRowIndex = 5
    public static let closedEyesRow = "HHFFFFFFFFFFHH"

    /// Row 8 carries the mouth; speaking alternates closed ↔ open so she looks
    /// like she's talking while the answer is read aloud.
    public static let mouthRowIndex = 8
    public static let openMouthRow = "HHFFFmmmmFFFHH"

    public static var width: Int { rows.first?.count ?? 0 }
    public static var height: Int { rows.count }

    /// The sprite must be a clean rectangle or the rendered art skews. Validated
    /// in tests so an edit that mis-sizes a row is caught before it ships.
    public static func isRectangular() -> Bool {
        guard width > 0, height > 0 else { return false }
        return rows.allSatisfy { $0.count == width }
            && closedEyesRow.count == width
            && openMouthRow.count == width
    }
}
