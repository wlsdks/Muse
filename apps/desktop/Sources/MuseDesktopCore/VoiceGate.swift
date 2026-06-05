import Foundation

/// The deterministic decision of what to do when the user asks by voice. Pure +
/// headless-testable; the AppKit `SpeechCapture` follows the same logic. Two
/// invariants live here:
///  1. Without the Info.plist usage strings (a bare `swift run`, no .app bundle)
///     we must NEVER call the speech/mic authorization APIs — macOS HARD-CRASHES
///     a process that asks without them. So that case falls back to typing.
///  2. Local-only: if on-device recognition isn't supported for the locale we
///     REFUSE rather than let Apple's recognizer use the network — the same
///     posture as MUSE_LOCAL_ONLY everywhere else.
public enum VoiceStart: Equatable, Sendable {
    case listen            // go ahead, capture on-device speech
    case fallbackToText    // can't/shouldn't listen → show the text field instead
    case refuseOffDevice   // on-device unavailable → refuse (don't go to the network)
}

public enum VoiceGate {
    public static func decide(
        usageStringsPresent: Bool,
        speechAuthorized: Bool,
        micAuthorized: Bool,
        recognizerAvailable: Bool,
        supportsOnDevice: Bool
    ) -> VoiceStart {
        guard usageStringsPresent else { return .fallbackToText }      // no bundle ⇒ never ask (would crash)
        guard speechAuthorized, micAuthorized, recognizerAvailable else { return .fallbackToText }
        guard supportsOnDevice else { return .refuseOffDevice }        // local-only: no network fallback
        return .listen
    }
}
