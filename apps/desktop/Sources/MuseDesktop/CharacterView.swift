import AppKit
import MuseDesktopCore

/// The on-screen avatar. The default look is the **bluebird** — Muse's mascot,
/// rendered LIVE (Core Graphics) from the canonical `@muse/mascot` pose matrices
/// (`MascotFrames`, codegen'd — the same bird the CLI banner, README SVG, and web
/// DeskPet draw). It runs a gentle "alive" idle loop (slow bob, blink, occasional
/// tilt/peck/preen/flap) and swaps to the matching pose while listening / thinking
/// / speaking. The glowing voice orb, a clean vector mascot, and the pixel sprites
/// (aria / celestial) are selectable alternates. All are original art.
final class CharacterView: NSView {
    enum State { case idle, listening, thinking, speaking }
    enum Look { case bird, orb, vector, pixel, harp }

    var state: State = .idle { didSet { needsDisplay = true } }
    var onClick: (() -> Void)?
    var sprite: Sprite = SpriteLibrary.default {
        didSet { rebuildColorCache(); tick = 0; blinking = false; mouthOpen = false; needsDisplay = true }
    }
    private var look: Look = .bird

    /// The bluebird is the default look; explicit alternates stay selectable.
    func setCharacterNamed(_ name: String?) {
        switch (name ?? "").lowercased() {
        case "orb":
            look = .orb
        case "vector":
            look = .vector
        case "pixel":
            look = .pixel
        default:
            look = .bird
        }
        tick = 0; needsDisplay = true
    }

    private var tick = 0
    private var blinking = false
    private var mouthOpen = false
    private var timer: Timer?
    private var colorCache: [Character: NSColor] = [:]

    // The bluebird's live idle loop (canonical MascotFrames rendered via CG).
    private var birdColorCache: [Character: NSColor] = [:]
    private var birdFrame = "stand"
    private var birdHold = 0        // frame-ticks left in the current variation
    private var birdStandFor = 14   // frame-ticks to stand before the next one

    override init(frame: NSRect) {
        super.init(frame: frame)
        rebuildColorCache()
        for (ch, hex) in MascotFrames.palette {
            if let color = HexColor.parse(hex) { birdColorCache[ch] = color }
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unused") }

    private func rebuildColorCache() {
        colorCache.removeAll(keepingCapacity: true)
        for (key, hex) in sprite.paletteMap() {
            if let color = HexColor.parse(hex) { colorCache[key] = color }
        }
    }

    // Standard (non-flipped) coordinates: the orb is symmetric, the vector
    // mascot sets up its own y-down space, and the pixel sprite flips its rows.
    override var isFlipped: Bool { false }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        timer?.invalidate()
        guard window != nil else { return }
        // ~25fps so the orb's pulse + ripples are smooth.
        let timer = Timer(timeInterval: 0.04, repeats: true) { [weak self] _ in self?.animate() }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func animate() {
        tick += 1
        blinking = (tick % 75 < 4)                                    // a ~160ms blink every ~3s
        mouthOpen = (state == .speaking) && ((tick / 6) % 2 == 0)     // flap while speaking
        // The bird's pixel poses hard-cut on a slower ~160ms frame clock.
        if look == .bird, tick % 4 == 0 { advanceBird() }
        needsDisplay = true
    }

    // (frame, holdTicks, weight) — blink is by far the most common (the ~3–5s
    // eye-blink); the rest are rarer flourishes. Mirrors the web DeskPet's set.
    private static let birdVariations: [(frame: String, hold: Int, weight: Double)] = [
        ("blink", 2, 5), ("tilt", 4, 4), ("peck", 4, 4), ("preen", 6, 2),
        ("tail", 3, 2), ("flapA", 4, 1), ("stretch", 5, 1), ("ruffleA", 3, 1), ("sing", 12, 0.5)
    ]

    private static func pickBirdVariation() -> (frame: String, hold: Int) {
        let total = birdVariations.reduce(0.0) { $0 + $1.weight }
        var target = Double.random(in: 0..<total)
        for v in birdVariations {
            if target < v.weight { return (v.frame, v.hold) }
            target -= v.weight
        }
        return (birdVariations[0].frame, birdVariations[0].hold)
    }

    /// Gentle "alive" idle loop for the bluebird: mostly stand, a blink every few
    /// seconds, and an occasional idle variation picked with sensible rarity —
    /// hard-cut frame swaps for the pixel-art feel. When Muse is actually
    /// listening / thinking / speaking we hold the matching canonical pose
    /// (attend / tilt / open-beak) instead of the idle loop. No-op under
    /// reduced-motion (the draw path pins it to a static stand).
    private func advanceBird() {
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { return }

        switch state {
        case .listening: birdFrame = "attend"; birdHold = 0; birdStandFor = 6; return
        case .thinking:  birdFrame = "tilt";   birdHold = 0; birdStandFor = 6; return
        case .speaking:  birdFrame = (birdFrame == "sing") ? "stand" : "sing"  // beak flap
                         birdHold = 0; birdStandFor = 6; return
        case .idle: break
        }

        if birdHold > 0 {
            birdHold -= 1
            switch birdFrame {                        // flutter: alternate the paired frames
            case "flapA": birdFrame = "flapB"
            case "flapB": birdFrame = "flapA"
            case "ruffleA": birdFrame = "ruffleB"
            case "ruffleB": birdFrame = "ruffleA"
            default: break
            }
            if birdHold == 0 { birdFrame = "stand" }
            return
        }
        if birdStandFor > 0 { birdStandFor -= 1; return }

        let pick = Self.pickBirdVariation()
        birdFrame = pick.frame
        birdHold = pick.hold
        birdStandFor = Int.random(in: 10...26)        // ~1.6s–4.2s standing between variations
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let phase = CGFloat(tick) * 0.08

        switch look {
        case .bird:
            drawBirdPixels(in: bounds, ctx: ctx)
            return
        case .orb:
            VoiceOrb.draw(in: bounds, state: state, phase: phase)
            return
        case .vector:
            let bob: CGFloat = (tick % 50 < 25) ? 0 : 2
            VectorMuse.draw(in: bounds, state: state, blink: blinking, mouthOpen: mouthOpen, breathe: bob)
            return
        case .harp:
            let bob: CGFloat = (tick % 60 < 30) ? 0 : 2
            HarpMuse.draw(in: bounds, state: state, phase: phase, breathe: bob)
            return
        case .pixel:
            break
        }

        ctx.setShouldAntialias(false)
        let cols = sprite.width
        let rowsN = sprite.height
        guard cols > 0, rowsN > 0 else { return }
        let cell = min(bounds.width / CGFloat(cols), bounds.height / CGFloat(rowsN))
        let artW = cell * CGFloat(cols)
        let artH = cell * CGFloat(rowsN)
        let originX = (bounds.width - artW) / 2
        let bob = (tick % 50 < 25) ? CGFloat(0) : cell * 0.18
        let originY = (bounds.height - artH) / 2 + bob

        for (r, baseRow) in sprite.rows.enumerated() {
            var row = baseRow
            if r == sprite.eyeRowIndex, blinking, let closed = sprite.closedEyesRow { row = closed }
            if r == sprite.mouthRowIndex, mouthOpen, let open = sprite.openMouthRow { row = open }
            // row 0 is the TOP of the sprite; in non-flipped coords that is high y.
            let y = originY + CGFloat(rowsN - 1 - r) * cell
            for (c, ch) in row.enumerated() {
                guard let color = colorCache[ch] else { continue }
                color.setFill()
                ctx.fill(CGRect(x: originX + CGFloat(c) * cell, y: y, width: cell, height: cell))
            }
        }

    }

    /// Draw the bluebird alive: the current canonical pose rendered as crisp
    /// nearest-neighbour pixels (filled cells, no image interpolation) with a
    /// slow ~1–2px vertical bob. Under reduced-motion it's a static stand pose,
    /// no bob. `birdFrame` is driven by `advanceBird()`.
    private func drawBirdPixels(in rect: NSRect, ctx: CGContext) {
        ctx.setShouldAntialias(false)
        let cols = MascotFrames.width
        let rowsN = MascotFrames.height
        guard cols > 0, rowsN > 0 else { return }

        let reduce = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let name = reduce ? "stand" : birdFrame
        let rows = MascotFrames.frames[name] ?? MascotFrames.frames["stand"] ?? []

        let cell = min(rect.width / CGFloat(cols), rect.height / CGFloat(rowsN))
        let artW = cell * CGFloat(cols)
        let artH = cell * CGFloat(rowsN)
        let originX = (rect.width - artW) / 2
        let bob = reduce ? 0 : CGFloat(sin(Double(tick) * 0.045)) * cell * 0.16   // slow ~5s bob
        let originY = (rect.height - artH) / 2 + bob

        for (r, row) in rows.enumerated() {
            // row 0 is the TOP of the sprite; in non-flipped coords that is high y.
            let y = originY + CGFloat(rowsN - 1 - r) * cell
            for (c, ch) in row.enumerated() {
                guard let color = birdColorCache[ch] else { continue }
                color.setFill()
                ctx.fill(CGRect(x: originX + CGFloat(c) * cell, y: y, width: cell, height: cell))
            }
        }
    }

    // Tap → onClick (open input); drag → move the window. (SwiftUI's hosting view
    // can swallow the events `isMovableByWindowBackground` relies on, so the orb
    // drives the window drag itself.)
    private var downPoint: NSPoint?
    private var didDrag = false

    override func mouseDown(with event: NSEvent) {
        downPoint = event.locationInWindow
        didDrag = false
    }

    override func mouseDragged(with event: NSEvent) {
        if let start = downPoint, !didDrag,
           abs(event.locationInWindow.x - start.x) > 3 || abs(event.locationInWindow.y - start.y) > 3 {
            didDrag = true
        }
        if didDrag { window?.performDrag(with: event) }
    }

    override func mouseUp(with event: NSEvent) {
        if !didDrag {
            window?.makeKey()   // so the input field can take keyboard focus immediately
            onClick?()
        }
        downPoint = nil
    }

    deinit { timer?.invalidate() }
}
