import AVFoundation

/// Speaks an answer aloud. Abstracted so the panel's logic stays testable and
/// so speech can be turned off (`MUSE_DESKTOP_SPEAK=0`) without branching.
protocol Speaker {
    func speak(_ text: String, onFinish: @escaping () -> Void)
}

/// On-device macOS speech (AVSpeechSynthesizer) — local by construction, no
/// cloud, no Muse server needed. (Wiring Muse's own Piper voice through the CLI
/// is a later refinement; this keeps slice 2 reliable and offline.)
final class SystemSpeaker: NSObject, Speaker, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var onFinish: (() -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String, onFinish: @escaping () -> Void) {
        self.onFinish = onFinish
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finish()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finish()
    }

    private func finish() {
        let callback = onFinish
        onFinish = nil
        callback?()
    }
}

/// Speech disabled — answers still show in the bubble.
final class SilentSpeaker: Speaker {
    func speak(_ text: String, onFinish: @escaping () -> Void) { onFinish() }
}

enum SpeakerFactory {
    static func make(environment: [String: String] = ProcessInfo.processInfo.environment) -> Speaker {
        environment["MUSE_DESKTOP_SPEAK"] == "0" ? SilentSpeaker() : SystemSpeaker()
    }
}
