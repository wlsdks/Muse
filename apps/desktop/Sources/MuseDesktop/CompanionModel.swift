import AppKit
import MuseDesktopCore

/// The companion's UI state + actions, driving the SwiftUI `CompanionView`. Owns
/// the bridge to the local Muse runtime (text + voice) and the language.
@MainActor
final class CompanionModel: ObservableObject {
    @Published var bubble: String
    @Published var inputText = ""
    @Published var inputVisible = false
    @Published var orbState: CharacterView.State = .idle
    @Published var lookName: String?
    @Published private(set) var language: ResolvedLanguage

    var voiceMuted = false

    private let speaker: Speaker = SpeakerFactory.make()
    private let speech = SpeechCapture()
    private var busy = false
    private var listening = false

    static var systemIsKorean: Bool { (Locale.preferredLanguages.first ?? "en").hasPrefix("ko") }

    init() {
        let prefs = PrefsStore.load()
        let pref = AppLanguage(rawValue: prefs.language ?? "") ?? .system
        let lang = resolveLanguage(pref, systemIsKorean: Self.systemIsKorean)
        lookName = ProcessInfo.processInfo.environment["MUSE_DESKTOP_CHARACTER"] ?? prefs.look
        language = lang
        bubble = "" // idle = just the orb; the bubble appears only on an answer / listening
        speech.localeIdentifier = lang.speechLocale // all stored props set → self usable
    }

    /// Tap the orb → toggle the input (always works); cancel voice if listening.
    /// Closing returns to just-the-orb (clears the bubble).
    func clickOrb() {
        guard !busy else { return }
        if listening { speech.cancel(); listening = false; orbState = .idle; return }
        inputVisible.toggle()
        if !inputVisible { bubble = "" }
        orbState = .idle
    }

    func submit() {
        let query = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, !busy else { return }
        busy = true
        inputVisible = false
        inputText = ""
        orbState = .thinking
        bubble = "…"
        Task { [weak self] in
            guard let self else { return }
            let result: Result<String, MuseBridgeError>
            do { result = .success(try await MuseBridge.ask(query: query)) }
            catch let error as MuseBridgeError { result = .failure(error) }
            catch { result = .failure(.cliFailed(status: -1, stderr: "\(error)")) }
            let presentation = MusePresenter.present(result, language: self.language)
            self.bubble = presentation.bubbleText
            self.busy = false
            if let speech = presentation.speechText, !self.voiceMuted {
                self.orbState = .speaking
                self.speaker.speak(speech) { [weak self] in Task { @MainActor in self?.orbState = .idle } }
            } else {
                self.orbState = .idle
            }
        }
    }

    func startVoice() {
        guard !busy, !listening else { return }
        listening = true
        orbState = .listening
        inputVisible = true      // keep the input bar — the transcript fills it live
        inputText = ""
        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.speech.start(
                    onPartial: { text in Task { @MainActor [weak self] in self?.inputText = text } },
                    onFinal: { text in Task { @MainActor [weak self] in self?.heardVoice(text) } }
                )
            } catch {
                self.listening = false
                self.orbState = .idle
                self.bubble = self.language.voiceUnavailable
                self.inputVisible = true
            }
        }
    }

    /// Recognised speech lands in the INPUT FIELD (Jinan: "말하면 입력창에 나왔으면") so
    /// you can review/edit it and press send — not auto-submitted.
    private func heardVoice(_ text: String) {
        listening = false
        orbState = .idle
        inputText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        inputVisible = true
    }

    func setCharacter(_ name: String) {
        lookName = name
        PrefsStore.update { $0.look = name }
    }

    func setLanguage(_ pref: AppLanguage) {
        PrefsStore.update { $0.language = pref.rawValue }
        language = resolveLanguage(pref, systemIsKorean: Self.systemIsKorean)
        speech.localeIdentifier = language.speechLocale
    }
}
