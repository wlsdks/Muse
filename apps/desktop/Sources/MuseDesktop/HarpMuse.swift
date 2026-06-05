import AppKit

/// An original, code-drawn **lyre** — the instrument of the Muses — as a
/// companion avatar: a glowing golden frame with shimmering strings over a soft
/// halo. Reactive: it breathes when idle, the halo swells while listening, and
/// the strings shimmer while speaking. Pure Core Graphics, no external art.
enum HarpMuse {
    private static let gold = NSColor(calibratedRed: 0.96, green: 0.80, blue: 0.42, alpha: 1)
    private static let goldDeep = NSColor(calibratedRed: 0.82, green: 0.58, blue: 0.24, alpha: 1)
    private static let glowViolet = NSColor(calibratedRed: 0.62, green: 0.50, blue: 0.98, alpha: 1)
    private static let string = NSColor(calibratedRed: 1.0, green: 0.94, blue: 0.78, alpha: 1)

    static func draw(in rect: NSRect, state: CharacterView.State, phase: CGFloat, breathe: CGFloat = 0) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let s = min(rect.width, rect.height)
        let cx = rect.midX
        let cy = rect.midY
        // Map a 0..1 unit design (y up) to screen coords, with a gentle breathing scale.
        let pulse = 1 + 0.015 * sin(phase) + breathe * 0.004
        let scale = s * 0.78 * pulse
        func P(_ ux: CGFloat, _ uy: CGFloat) -> CGPoint {
            CGPoint(x: cx + (ux - 0.5) * scale, y: cy + (uy - 0.5) * scale)
        }

        // --- soft halo behind the lyre ---
        let haloBoost: CGFloat = state == .listening ? 0.35 : (state == .speaking ? 0.22 : 0.12)
        let haloR = s * (0.46 + 0.03 * sin(phase * 0.9))
        if let space = CGColorSpace(name: CGColorSpace.sRGB) {
            let cols = [glowViolet.withAlphaComponent(haloBoost).cgColor,
                        glowViolet.withAlphaComponent(0).cgColor] as CFArray
            if let grad = CGGradient(colorsSpace: space, colors: cols, locations: [0, 1]) {
                ctx.drawRadialGradient(grad, startCenter: CGPoint(x: cx, y: cy), startRadius: 0,
                                       endCenter: CGPoint(x: cx, y: cy), endRadius: haloR, options: [])
            }
        }

        // --- the soundbox (rounded bowl at the base) ---
        ctx.saveGState()
        ctx.setShadow(offset: .zero, blur: s * 0.045, color: gold.withAlphaComponent(0.55).cgColor)
        let bw = scale * 0.34, bh = scale * 0.22
        let bc = P(0.5, 0.18)
        let bodyRect = CGRect(x: bc.x - bw / 2, y: bc.y - bh / 2, width: bw, height: bh)
        let body = NSBezierPath(roundedRect: bodyRect, xRadius: bw * 0.42, yRadius: bh * 0.45)
        fillVertical(body.cgPath, in: ctx, top: gold, bottom: goldDeep)

        // --- two symmetric arms, each ONE smooth cubic (mirrored) ---
        func arm(_ mirror: Bool) -> CGPath {
            func X(_ x: CGFloat) -> CGFloat { mirror ? 1 - x : x }
            let p = CGMutablePath()
            p.move(to: P(X(0.38), 0.30))                                   // body shoulder
            p.addCurve(to: P(X(0.33), 0.84),                               // up to the yoke tip
                       control1: P(X(0.13), 0.42),
                       control2: P(X(0.15), 0.76))
            return p
        }
        // yoke: a clean crossbar arcing gently over the two arm tips
        let yoke = CGMutablePath()
        yoke.move(to: P(0.31, 0.84))
        yoke.addQuadCurve(to: P(0.69, 0.84), control: P(0.5, 0.90))

        let goldFrame = [arm(false), arm(true), yoke]
        ctx.setLineCap(.round); ctx.setLineJoin(.round)
        for pass in 0..<2 {                                               // outer gold, then white core highlight
            for path in goldFrame { ctx.addPath(path) }
            ctx.setStrokeColor(pass == 0 ? gold.cgColor : NSColor.white.withAlphaComponent(0.5).cgColor)
            ctx.setLineWidth(pass == 0 ? s * 0.040 : s * 0.013)
            ctx.strokePath()
        }
        // little scroll knobs where the arms meet the yoke
        for tip in [P(0.33, 0.84), P(0.67, 0.84)] {
            ctx.setFillColor(gold.cgColor)
            ctx.fillEllipse(in: CGRect(x: tip.x - s * 0.028, y: tip.y - s * 0.028, width: s * 0.056, height: s * 0.056))
            ctx.setFillColor(NSColor.white.withAlphaComponent(0.85).cgColor)
            ctx.fillEllipse(in: CGRect(x: tip.x - s * 0.011, y: tip.y - s * 0.011, width: s * 0.022, height: s * 0.022))
        }
        ctx.restoreGState()

        // --- strings (yoke → body bridge), shimmering while speaking ---
        let count = 7
        for i in 0..<count {
            let t = CGFloat(i) / CGFloat(count - 1)
            let topX = 0.40 + t * 0.20
            let botX = 0.41 + t * 0.18
            var alpha: CGFloat = 0.8
            if state == .speaking {
                alpha = 0.4 + 0.5 * abs(sin(phase * 2 + CGFloat(i) * 0.7))
            } else if state == .listening {
                alpha = 0.65 + 0.3 * abs(sin(phase + CGFloat(i)))
            }
            let path = CGMutablePath()
            path.move(to: P(topX, 0.82))
            path.addLine(to: P(botX, 0.30))
            ctx.addPath(path)
            ctx.setStrokeColor(string.withAlphaComponent(alpha).cgColor)
            ctx.setLineWidth(s * 0.0055)
            ctx.strokePath()
        }

        // --- a bright sound-hole gem on the body ---
        let gem = P(0.5, 0.18)
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.92).cgColor)
        ctx.fillEllipse(in: CGRect(x: gem.x - s * 0.02, y: gem.y - s * 0.02, width: s * 0.04, height: s * 0.04))
    }

    private static func fillVertical(_ path: CGPath, in ctx: CGContext, top: NSColor, bottom: NSColor) {
        ctx.saveGState()
        ctx.addPath(path)
        ctx.clip()
        let box = path.boundingBox
        if let space = CGColorSpace(name: CGColorSpace.sRGB),
           let grad = CGGradient(colorsSpace: space, colors: [top.cgColor, bottom.cgColor] as CFArray, locations: [0, 1]) {
            ctx.drawLinearGradient(grad, start: CGPoint(x: box.midX, y: box.maxY),
                                   end: CGPoint(x: box.midX, y: box.minY), options: [])
        }
        ctx.restoreGState()
    }
}
