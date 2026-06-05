import SwiftUI

/// The modern, glassmorphic companion UI (SwiftUI). When idle it's JUST the orb,
/// gently drifting; an answer card / input appear only when needed. While
/// listening, notes drift up so it's clear Muse is hearing you. Frosted
/// "Liquid Glass" over the desktop with spring transitions.
struct CompanionView: View {
    @ObservedObject var model: CompanionModel
    @State private var drift = false

    private let accent = Color(red: 0.62, green: 0.91, blue: 1.0)
    private let violet = Color(red: 0.55, green: 0.45, blue: 0.95)

    var body: some View {
        VStack(spacing: 14) {
            answerCard
            Spacer(minLength: 0)
            orb
            if model.inputVisible { inputBar }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(width: 360, height: 360)
        .background(WindowDragArea())
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: model.inputVisible)
        .animation(.easeInOut(duration: 0.22), value: model.bubble)
        .onAppear { drift = true }
    }

    private var orb: some View {
        ZStack {
            OrbRepresentable(lookName: model.lookName, state: model.orbState, onClick: { model.clickOrb() })
                .frame(width: 116, height: 116)
            if model.orbState == .listening {
                ListeningNotes(accent: accent)
                    .frame(width: 116, height: 116)
                    .allowsHitTesting(false)
            }
        }
        // gentle "alive" drift when idle
        .offset(y: drift ? -5 : 5)
        .animation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true), value: drift)
    }

    @ViewBuilder private var answerCard: some View {
        if !model.bubble.isEmpty {
            ScrollView {
                Text(model.bubble)
                    .font(.system(size: 13.5, weight: .regular))
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .lineSpacing(2)
            }
            .frame(maxHeight: 152)
            .padding(16)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(
                        LinearGradient(colors: [violet.opacity(0.55), accent.opacity(0.45)], startPoint: .topLeading, endPoint: .bottomTrailing),
                        lineWidth: 1
                    )
            )
            .shadow(color: violet.opacity(0.22), radius: 22, x: 0, y: 10)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            Button(action: { model.startVoice() }) {
                Image(systemName: model.orbState == .listening ? "waveform" : "mic.fill")
                    .font(.system(size: 14, weight: .medium))
            }
            .buttonStyle(.plain)
            .foregroundStyle(model.orbState == .listening ? accent : Color.secondary)

            TextField(model.language.askPlaceholder, text: $model.inputText)
                .textFieldStyle(.plain)
                .font(.system(size: 13.5))
                .onSubmit { model.submit() }

            Button(action: { model.submit() }) {
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 20, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(LinearGradient(colors: [violet, Color(red: 0.40, green: 0.62, blue: 0.98)], startPoint: .top, endPoint: .bottom))
            .opacity(model.inputText.trimmingCharacters(in: .whitespaces).isEmpty ? 0.35 : 1)
        }
        .padding(.horizontal, 17)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.22), lineWidth: 0.8))
        .shadow(color: .black.opacity(0.2), radius: 14, x: 0, y: 5)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// Musical notes drifting up around the orb — a clear "I'm listening" signal.
private struct ListeningNotes: View {
    let accent: Color
    @State private var animate = false

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                Image(systemName: "music.note")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(accent)
                    .offset(x: [-20, 4, 24][i], y: animate ? -52 : -6)
                    .opacity(animate ? 0 : 0.95)
                    .animation(
                        .easeOut(duration: 1.7).repeatForever(autoreverses: false).delay(Double(i) * 0.55),
                        value: animate
                    )
            }
        }
        .onAppear { animate = true }
    }
}
