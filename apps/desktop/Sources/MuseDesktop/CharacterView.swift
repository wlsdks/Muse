import AppKit
import MuseDesktopCore

/// Renders the `MuseSprite` as a pretty, faintly-alive pixel-art Muse: a
/// laurel-crowned woman with auburn hair and a cream dress. She breathes
/// (gentle bob), blinks, mouths the words while speaking, and shows a little
/// gold music note when listening/speaking — the "woman enjoying music" feel,
/// Muse-styled. A real artist sprite sheet can replace this grid later without
/// touching the app.
final class CharacterView: NSView {
    enum State { case idle, listening, thinking, speaking }

    var state: State = .idle { didSet { needsDisplay = true } }
    var onClick: (() -> Void)?

    private var tick = 0
    private var blinking = false
    private var mouthOpen = false
    private var timer: Timer?

    override var isFlipped: Bool { true }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        timer?.invalidate()
        guard window != nil else { return }
        // ~6 fps is plenty for breathing/blink/talk and stays cheap.
        let timer = Timer(timeInterval: 0.16, repeats: true) { [weak self] _ in self?.animate() }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func animate() {
        tick += 1
        // Blink for one frame roughly every ~3s.
        blinking = (tick % 19 == 0)
        // While speaking, flap the mouth open/closed every frame.
        mouthOpen = (state == .speaking) && (tick % 2 == 0)
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setShouldAntialias(false)

        let cols = MuseSprite.width
        let rowsN = MuseSprite.height
        let cell = min(bounds.width / CGFloat(cols), bounds.height / CGFloat(rowsN))
        let artW = cell * CGFloat(cols)
        let artH = cell * CGFloat(rowsN)
        let originX = (bounds.width - artW) / 2
        // Gentle breathing bob (±~1px).
        let bob = (tick % 12 < 6) ? CGFloat(0) : cell * 0.18
        let originY = (bounds.height - artH) / 2 + bob

        for (r, rowStr) in MuseSprite.rows.enumerated() {
            var row = rowStr
            if r == MuseSprite.eyeRowIndex && blinking { row = MuseSprite.closedEyesRow }
            if r == MuseSprite.mouthRowIndex && mouthOpen { row = MuseSprite.openMouthRow }
            for (c, ch) in row.enumerated() {
                guard let color = MusePalette.color(for: ch) else { continue }
                color.setFill()
                ctx.fill(CGRect(
                    x: originX + CGFloat(c) * cell,
                    y: originY + CGFloat(r) * cell,
                    width: cell, height: cell
                ))
            }
        }

        if state == .listening || state == .speaking {
            drawMusicNote(in: ctx, near: CGRect(x: originX, y: originY, width: artW, height: artH), cell: cell)
        }
    }

    private func drawMusicNote(in ctx: CGContext, near art: CGRect, cell: CGFloat) {
        let note = "\u{266A}" // ♪
        let size = max(12, cell * 2)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: size, weight: .bold),
            .foregroundColor: MusePalette.color(for: "G") ?? NSColor.systemYellow
        ]
        let point = NSPoint(x: art.maxX - cell, y: art.minY - bob(cell))
        note.draw(at: point, withAttributes: attributes)
    }

    private func bob(_ cell: CGFloat) -> CGFloat { (tick % 8 < 4) ? 0 : cell * 0.4 }

    override func mouseDown(with event: NSEvent) { onClick?() }

    deinit { timer?.invalidate() }
}
