import Foundation

/// Builds the full-app URL to open when the user taps the companion bubble.
/// Tapping a GROUNDED opener (a reminder / event / follow-up) should open chat
/// ON that subject — so we append the grounded `topic` as a `?companion_seed=`
/// query the web app can pre-fill the chat input from. Pure + testable.
///
/// SAFETY: the seed only PRE-FILLS the chat input; it never auto-submits, and
/// any state-changing / outbound action the user then takes still flows through
/// the existing approval gate (outbound-safety). An empty topic (greeting / joke)
/// opens the app unchanged — never a dead bubble, never a fabricated action.
public enum CompanionSeed {
    /// Append the grounded `topic` as a seed query on `base`, or return `base`
    /// unchanged when there's no topic. Only the first non-empty topic seeds; the
    /// value is percent-encoded so titles with spaces / punctuation stay valid.
    public static func url(base: String, topic: String) -> String {
        let trimmedBase = base.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTopic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTopic.isEmpty, var components = URLComponents(string: trimmedBase) else {
            return trimmedBase
        }
        var items = components.queryItems ?? []
        items.append(URLQueryItem(name: "companion_seed", value: trimmedTopic))
        components.queryItems = items
        return components.string ?? trimmedBase
    }
}
