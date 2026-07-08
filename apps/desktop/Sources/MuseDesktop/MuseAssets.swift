import AppKit

/// Shared access to the Muse bluebird mascot image (a bundled SwiftPM resource).
/// `muse-bird.png` is GENERATED from the canonical `@muse/mascot` pixel data
/// (`apps/desktop/scripts/gen-app-icon.mjs --bird`) — the same bird that ships in
/// the CLI banner, the README SVG, and the web DeskPet. Single source of truth;
/// never hand-edited. Regenerate it after the pixel data changes.
enum MuseAssets {
    private static var cache: NSImage?

    /// The bluebird portrait (transparent PNG; composites over the desktop).
    static var bird: NSImage? {
        if let cache { return cache }
        var image: NSImage?
        for bundle in [Bundle.module, Bundle.main] {
            if let url = bundle.url(forResource: "muse-bird", withExtension: "png"),
               let img = NSImage(contentsOf: url) { image = img; break }
        }
        cache = image
        return image
    }
}
