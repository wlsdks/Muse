import AppKit
import SwiftUI

/// The modern, glassmorphic companion UI (SwiftUI). Idle = just the orb (gently
/// drifting); an answer card / input appear only when needed. While listening,
/// notes drift up; while thinking, an animated typing indicator. Frosted
/// "Liquid Glass" over the desktop with spring transitions.
struct CompanionView: View {
    @ObservedObject var model: CompanionModel
    @State private var drift = false
    @FocusState private var inputFocused: Bool

    private let violet = Color(red: 0.55, green: 0.45, blue: 0.95)
    // Brand palette (packages/mascot): indigo #5e6ad2 / bright #828fff.
    private let brandIndigo = Color(red: 0.369, green: 0.416, blue: 0.824)
    private let brandIndigoLt = Color(red: 0.510, green: 0.561, blue: 1.0)

    var body: some View {
        VStack(spacing: 10) {
            Spacer(minLength: 0)
            orb
                .overlay(alignment: .top) { bubbleOverlay }   // FLOATS above the bird; zero layout effect → the bird never moves
            if model.inputVisible { inputBar }
            Spacer(minLength: 0).frame(maxHeight: 60)          // bias the bird toward the lower half → headroom for the bubble
        }
        .padding(18)
        .frame(width: 360, height: 440)
        .background(WindowDragArea())
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: model.inputVisible)
        .animation(.easeInOut(duration: 0.22), value: model.bubble)
        .animation(.easeInOut(duration: 0.22), value: model.orbState)
        .onAppear { drift = true; model.startIdleChatter() }
        .onChange(of: model.inputVisible) { _, visible in
            if visible { inputFocused = true }   // ready to type the moment input appears
        }
    }

    private var orb: some View {
        OrbRepresentable(lookName: model.lookName, state: model.orbState, onClick: { model.clickOrb() })
            .frame(width: 150, height: 178)
            .offset(y: drift ? -5 : 5)
            .animation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true), value: drift)
    }

    /// The speech bubble (or the thinking indicator) FLOATS above the bird as an
    /// overlay, so it has zero effect on the bird's layout — the character never
    /// moves down when a bubble shows/hides. The `alignmentGuide` lifts the whole
    /// overlay up so its BOTTOM sits a small gap above the bird's top, centred.
    @ViewBuilder private var bubbleOverlay: some View {
        Group {
            if !model.bubble.isEmpty {
                bubbleCard
            } else if model.orbState == .thinking {
                card { HStack { TypingIndicator(color: brandIndigoLt); Spacer() } }
            }
        }
        .alignmentGuide(.top) { d in d.height + 12 }   // float fully above the bird, 12px gap
    }

    private var bubbleCard: some View {
        card {
            // Hugs its text: wraps up to a max width, grows vertically to fit —
            // no fixed box. Scrolls only when an answer is very long.
            ScrollView {
                Text(model.bubble)
                    .font(.system(size: 13.5))
                    .foregroundStyle(.white.opacity(0.95))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: 280, alignment: .leading)
                    .textSelection(.enabled)
                    .lineSpacing(3)
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxHeight: 150)
            .fixedSize(horizontal: true, vertical: true)
        }
        .contentShape(Rectangle())
        .onTapGesture { model.tapBubble() }            // tap Muse's message → open chat (seeded on its topic)
    }

    /// The shared bubble style — a self-contained crafted "chip" that reads as
    /// premium on ANY background, DARK included (it does not rely on colourful
    /// content behind it to refract). A lifted indigo-tinted vertical gradient
    /// fill (never flat-black) carried over a whisper of native Liquid Glass, an
    /// elegant double rim (bright top light-catch + faint full-perimeter
    /// hairline), a faint indigo inner glow, and a triple floating shadow (indigo
    /// bloom + wide soft halo pooling below + tight black contact). Under Reduce
    /// Transparency the glass drops and the same solid gradient card carries the
    /// look, so the fallback is visually indistinguishable.
    @ViewBuilder private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        let reduce = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
        let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)
        content()
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .modifier(BubbleMaterial(shape: shape, reduce: reduce, tint: brandIndigo))
            // Top-third luminous sheen — light entering the surface.
            .overlay {
                if !reduce {
                    shape
                        .fill(LinearGradient(colors: [.white.opacity(0.10), .clear], startPoint: .top, endPoint: .center))
                        .blendMode(.plusLighter)
                        .allowsHitTesting(false)
                }
            }
            // Two rims: a faint full-perimeter hairline keeps the squircle crisp
            // on near-black; a brighter top-edge one is the light catching the rim.
            .overlay(shape.strokeBorder(.white.opacity(0.17), lineWidth: 0.6))
            .overlay(
                shape.strokeBorder(
                    LinearGradient(colors: [.white.opacity(reduce ? 0.30 : 0.55), .clear], startPoint: .top, endPoint: .center),
                    lineWidth: 1
                )
            )
            // Triple shadow: an on-brand indigo bloom + a wider soft halo pooling
            // below for float + a tight black contact shadow — this is what gives
            // the chip lift on a dark desktop where glass has nothing to refract.
            .shadow(color: brandIndigo.opacity(reduce ? 0 : 0.32), radius: 22, x: 0, y: 5)
            .shadow(color: brandIndigoLt.opacity(reduce ? 0 : 0.16), radius: 40, x: 0, y: 8)
            .shadow(color: .black.opacity(0.42), radius: 12, x: 0, y: 7)
            .transition(.move(edge: .top).combined(with: .opacity))
    }

    private var inputBar: some View {
        HStack(alignment: .center, spacing: 11) {
            Button(action: { model.startVoice() }) {
                Image(systemName: model.orbState == .listening ? "stop.circle.fill" : "mic.fill")
                    .font(.system(size: 15, weight: .medium))
                    .frame(width: 20)
            }
            .buttonStyle(.plain)
            .foregroundStyle(model.orbState == .listening ? Color(red: 0.95, green: 0.45, blue: 0.5) : Color.secondary)
            .help(model.orbState == .listening ? "Tap to finish" : "Talk to Muse by voice")

            // Grows vertically as you type so a long question stays fully visible.
            TextField(model.language.askPlaceholder, text: $model.inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 13.5))
                .lineLimit(1...6)
                .focused($inputFocused)
                .onSubmit { model.submit() }

            Button(action: { model.submit() }) {
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 19, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(LinearGradient(colors: [violet, Color(red: 0.40, green: 0.62, blue: 0.98)], startPoint: .top, endPoint: .bottom))
            .opacity(model.inputText.trimmingCharacters(in: .whitespaces).isEmpty ? 0.35 : 1)

            // Open the full Muse app.
            Button(action: { NotificationCenter.default.post(name: .museOpenFullApp, object: nil) }) {
                Image(systemName: "arrow.up.left.and.arrow.down.right").font(.system(size: 13, weight: .medium)).frame(width: 18)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.secondary.opacity(0.7))
            .help("Open the full Muse app")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 21, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous).strokeBorder(.white.opacity(0.22), lineWidth: 0.8))
        .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 4)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// Three dots pulsing in a wave — Muse is thinking.
private struct TypingIndicator: View {
    let color: Color
    @State private var animating = false
    var body: some View {
        HStack(spacing: 7) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                    .scaleEffect(animating ? 1 : 0.45)
                    .opacity(animating ? 1 : 0.4)
                    .animation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true).delay(Double(i) * 0.18), value: animating)
            }
        }
        .onAppear { animating = true }
    }
}

/// The bubble's self-contained fill — a lifted indigo-tinted vertical gradient
/// (never flat-black) so the chip reads as a raised object even against
/// near-black, carried over a whisper of translucency: native SwiftUI Liquid
/// Glass on macOS 26+, an `NSVisualEffectView` behind-window blur on macOS
/// 14–25, and nothing (just the gradient) under Reduce Transparency. A faint
/// indigo radial glow near the top adds brand warmth. All clipped to the SAME
/// continuous shape so the rims, sheen and shadow layered on top read
/// identically. The gradient/rim/shadow — NOT the glass — carry the look, so it
/// stays premium on a dark desktop where the glass has nothing to refract.
private struct BubbleMaterial: ViewModifier {
    let shape: RoundedRectangle
    let reduce: Bool
    let tint: Color

    // Lifted indigo-tinted top → deeper bottom.
    private let fillTop = Color(red: 0.137, green: 0.145, blue: 0.212)
    private let fillBot = Color(red: 0.082, green: 0.086, blue: 0.129)

    func body(content: Content) -> some View {
        content
            .background {
                if reduce {
                    shape.fill(LinearGradient(colors: [fillTop, fillBot], startPoint: .top, endPoint: .bottom))
                } else {
                    ZStack {
                        glassBase
                        shape.fill(LinearGradient(colors: [fillTop.opacity(0.92), fillBot.opacity(0.95)], startPoint: .top, endPoint: .bottom))
                        shape.fill(
                            RadialGradient(colors: [tint.opacity(0.26), .clear], center: .top, startRadius: 2, endRadius: 150)
                        )
                        .blendMode(.plusLighter)
                    }
                }
            }
            .clipShape(shape)
    }

    @ViewBuilder private var glassBase: some View {
        if #available(macOS 26.0, *) {
            Color.clear.glassEffect(.regular, in: shape)
        } else {
            LiquidGlass(cornerRadius: 20)
        }
    }
}

/// Apple "Liquid Glass": a real `NSVisualEffectView` behind the bubble content.
/// `.behindWindow` blending samples the desktop behind the transparent companion
/// window (the window is borderless + `.clear`), giving true translucent depth
/// rather than a flat fill. Corners are masked to the continuous (squircle) curve;
/// the hairline border + drop shadow are applied by the SwiftUI card OUTSIDE this
/// clip. Under Reduce Transparency `NSVisualEffectView` becomes opaque, and the
/// card additionally swaps to a solid dark panel — so the fallback is guaranteed.
private struct LiquidGlass: NSViewRepresentable {
    var cornerRadius: CGFloat

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        view.isEmphasized = true
        view.wantsLayer = true
        view.layer?.cornerRadius = cornerRadius
        view.layer?.cornerCurve = .continuous
        view.layer?.masksToBounds = true
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {
        view.layer?.cornerRadius = cornerRadius
    }
}
