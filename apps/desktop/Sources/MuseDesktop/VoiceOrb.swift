import AppKit

/// A glowing, state-reactive voice ORB — the modern AI-assistant visual
/// (Siri / Apple Intelligence / ChatGPT voice). Pure Core Graphics: a layered
/// halo, a luminous translucent sphere with iridescent colour that slowly flows
/// inside, a bright core, a crisp rim light, and concentric ripples when
/// listening/speaking. Original art (pure code). `phase` drives the animation.
enum VoiceOrb {
    private static let deep = NSColor(srgbRed: 0.13, green: 0.08, blue: 0.38, alpha: 1)
    private static let mid = NSColor(srgbRed: 0.42, green: 0.30, blue: 0.94, alpha: 1)
    private static let core = NSColor(srgbRed: 0.70, green: 0.74, blue: 1.00, alpha: 1)
    private static let glow = NSColor(srgbRed: 0.52, green: 0.42, blue: 0.98, alpha: 1)
    private static let accent = NSColor(srgbRed: 0.62, green: 0.91, blue: 1.00, alpha: 1)
    // Iridescent tints that flow inside the sphere for an Apple-Intelligence shimmer.
    private static let cyanTint = NSColor(srgbRed: 0.46, green: 0.90, blue: 1.00, alpha: 1)
    private static let pinkTint = NSColor(srgbRed: 1.00, green: 0.50, blue: 0.84, alpha: 1)
    private static let violetTint = NSColor(srgbRed: 0.64, green: 0.46, blue: 1.00, alpha: 1)

    static func draw(in rect: NSRect, state: CharacterView.State, phase: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setShouldAntialias(true)
        let cx = rect.midX, cy = rect.midY
        let base = min(rect.width, rect.height) * 0.29
        let pulse: CGFloat = state == .speaking ? 1 + 0.06 * sin(phase * 2) : 1 + 0.03 * sin(phase)
        let r = base * pulse

        // layered outer glow — a contained violet bloom + a faint cyan ring
        radial(ctx, center: CGPoint(x: cx, y: cy), r0: r * 0.7, r1: r * 1.95,
               colors: [glow.withAlphaComponent(0.55), glow.withAlphaComponent(0)], locations: [0, 1])
        radial(ctx, center: CGPoint(x: cx, y: cy), r0: r * 0.95, r1: r * 1.7,
               colors: [accent.withAlphaComponent(0.16), accent.withAlphaComponent(0)], locations: [0, 1])

        // ripples while listening/speaking
        if state == .listening || state == .speaking {
            for i in 0..<3 {
                let t = ((phase / (2 * .pi)) + CGFloat(i) / 3).truncatingRemainder(dividingBy: 1)
                let rr = r * (1 + t * 1.15)
                ctx.setStrokeColor(accent.withAlphaComponent(0.5 * (1 - t)).cgColor)
                ctx.setLineWidth(2.5)
                ctx.strokeEllipse(in: CGRect(x: cx - rr, y: cy - rr, width: rr * 2, height: rr * 2))
            }
        }

        sphere(ctx, cx: cx, cy: cy, r: r, phase: phase)

        // thinking: a small bright bead orbiting the rim
        if state == .thinking {
            let a = phase
            let bx = cx + cos(a) * r * 0.80, by = cy + sin(a) * r * 0.80
            radial(ctx, center: CGPoint(x: bx, y: by), r0: 0, r1: r * 0.24,
                   colors: [accent.withAlphaComponent(0.95), accent.withAlphaComponent(0)], locations: [0, 1])
        }
    }

    /// The luminous iridescent sphere: base depth gradient, three slowly-flowing
    /// colour blobs, a bright core bloom, a rim light, and a crisp specular.
    private static func sphere(_ ctx: CGContext, cx: CGFloat, cy: CGFloat, r: CGFloat, phase: CGFloat) {
        ctx.saveGState()
        ctx.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
        ctx.clip()

        // base depth: a luminous core fading to a deep indigo edge
        let hx = cx - r * 0.26, hy = cy + r * 0.30
        if let grad = gradient([core, mid, deep], [0, 0.52, 1]) {
            ctx.drawRadialGradient(grad, startCenter: CGPoint(x: hx, y: hy), startRadius: 0,
                                   endCenter: CGPoint(x: cx, y: cy), endRadius: r * 1.05, options: [.drawsAfterEndLocation])
        }

        // iridescent flow — three tints orbiting slowly inside (the "alive" shimmer)
        let tints: [(NSColor, CGFloat, CGFloat)] = [
            (cyanTint, phase * 0.6, 0.42),
            (pinkTint, phase * 0.6 + 2.1, 0.40),
            (violetTint, phase * 0.6 + 4.2, 0.36)
        ]
        ctx.setBlendMode(.screen)
        for (tint, angle, dist) in tints {
            let px = cx + cos(angle) * r * dist
            let py = cy + sin(angle) * r * dist
            radial(ctx, center: CGPoint(x: px, y: py), r0: 0, r1: r * 0.78,
                   colors: [tint.withAlphaComponent(0.55), tint.withAlphaComponent(0)], locations: [0, 1])
        }
        ctx.setBlendMode(.normal)

        // a small bright core bloom (a spot, not the whole sphere)
        radial(ctx, center: CGPoint(x: hx, y: hy), r0: 0, r1: r * 0.32,
               colors: [core.withAlphaComponent(0.8), core.withAlphaComponent(0)], locations: [0, 1])
        ctx.restoreGState()

        // luminous rim light (brightest at the top), then a crisp specular dot
        ctx.saveGState()
        ctx.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
        ctx.setLineWidth(max(1, r * 0.05))
        ctx.replacePathWithStrokedPath()
        ctx.clip()
        radial(ctx, center: CGPoint(x: cx, y: cy + r * 0.7), r0: r * 0.2, r1: r * 1.3,
               colors: [accent.withAlphaComponent(0.85), accent.withAlphaComponent(0.05)], locations: [0, 1])
        ctx.restoreGState()

        let sx = cx - r * 0.30, sy = cy + r * 0.34
        radial(ctx, center: CGPoint(x: sx, y: sy), r0: 0, r1: r * 0.34,
               colors: [NSColor.white.withAlphaComponent(0.95), NSColor.white.withAlphaComponent(0)], locations: [0, 1])
    }

    /// A small orb image for the menu-bar status item — Muse, recognizable.
    static func icon(diameter: CGFloat = 18) -> NSImage {
        let image = NSImage(size: NSSize(width: diameter, height: diameter))
        image.lockFocus()
        if let ctx = NSGraphicsContext.current?.cgContext {
            ctx.setShouldAntialias(true)
            sphere(ctx, cx: diameter / 2, cy: diameter / 2, r: diameter / 2 - 1, phase: 0)
        }
        image.unlockFocus()
        return image
    }

    private static func gradient(_ colors: [NSColor], _ locations: [CGFloat]) -> CGGradient? {
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        return CGGradient(colorsSpace: space, colors: colors.map { $0.cgColor } as CFArray, locations: locations)
    }

    private static func radial(_ ctx: CGContext, center: CGPoint, r0: CGFloat, r1: CGFloat, colors: [NSColor], locations: [CGFloat]) {
        guard let grad = gradient(colors, locations) else { return }
        ctx.drawRadialGradient(grad, startCenter: center, startRadius: r0, endCenter: center, endRadius: r1, options: [.drawsAfterEndLocation])
    }
}
