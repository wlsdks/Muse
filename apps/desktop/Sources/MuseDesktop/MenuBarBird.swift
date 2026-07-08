import AppKit

/// Builds the menu-bar status-item image: a monochrome silhouette of the
/// canonical bluebird's `stand` pose (single-sourced from `MascotFrames`),
/// returned as a TEMPLATE image so macOS tints it to match the menu bar
/// (light/dark + vibrancy) automatically.
///
/// At 16–18pt the full-colour pixel bird turns to mud, so we render a filled
/// silhouette instead — every non-transparent pixel becomes opaque, and the
/// eye pixel is punched back OUT as a hole so the bird still reads as a bird.
/// The shape is drawn at a high integer scale and handed to AppKit at an
/// 18pt cap, so the down-scale is smooth rather than a blocky 13px blob.
enum MenuBarBird {
    /// A template NSImage of the stand-pose silhouette, sized for the menu bar.
    static func templateImage(pointHeight: CGFloat = 18) -> NSImage {
        let frame = MascotFrames.frames["stand"] ?? []
        let cols = MascotFrames.width
        let rows = MascotFrames.height
        let scale = 8
        let pxW = cols * scale
        let pxH = rows * scale

        let image = NSImage(size: NSSize(width: pxW, height: pxH))
        image.lockFocus()
        let ctx = NSGraphicsContext.current
        ctx?.cgContext.setShouldAntialias(false)
        NSColor.black.setFill()
        for (r, row) in frame.enumerated() {
            for (c, ch) in row.enumerated() {
                // "." is transparent; the eye ("K") is punched OUT as a hole so
                // the silhouette still reads as a bird's head, not a blob.
                if ch == "." || ch == "K" { continue }
                // Bitmap origin is bottom-left; sprite row 0 is the TOP → flip y.
                NSBezierPath.fill(NSRect(x: c * scale, y: (rows - 1 - r) * scale, width: scale, height: scale))
            }
        }
        image.unlockFocus()

        // Present at a menu-bar-appropriate point size (aspect-preserving),
        // letting AppKit smooth-scale the high-res silhouette down.
        let pointWidth = pointHeight * CGFloat(pxW) / CGFloat(pxH)
        image.size = NSSize(width: pointWidth, height: pointHeight)
        image.isTemplate = true
        return image
    }
}
