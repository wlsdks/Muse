import Foundation

/// A resolved command line for one grounded Muse answer.
public struct MuseInvocation: Equatable, Sendable {
    public let executable: String
    public let arguments: [String]

    public init(executable: String, arguments: [String]) {
        self.executable = executable
        self.arguments = arguments
    }
}

public enum MuseBridgeError: Error, Equatable {
    case emptyQuery
    case cliFailed(status: Int32, stderr: String)
}

/// Bridges the desktop companion to the existing local Muse runtime by
/// shelling out to the `muse` CLI. The companion is a thin window over the same
/// agent — NOT a second implementation — so cited recall, the refusal floor,
/// and the local-only guarantee all come for free.
public enum MuseBridge {
    /// The CLI to invoke. Resolution order:
    ///  1. `MUSE_BIN` env override (an absolute path or a name on PATH) — for devs.
    ///  2. The self-contained CLI binary bundled inside the .app, resolved
    ///     RELATIVE to the bundle at runtime — so a moved/distributed .app still
    ///     finds it (no baked absolute path, no external node / repo needed).
    ///  3. `muse` on PATH.
    public static func defaultBin(environment: [String: String] = ProcessInfo.processInfo.environment) -> String {
        if let override = environment["MUSE_BIN"], !override.isEmpty {
            return override
        }
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("muse-cli-bin").path,
           FileManager.default.isExecutableFile(atPath: bundled) {
            return bundled
        }
        return "muse"
    }

    /// Build the invocation for a CONVERSATIONAL turn. `muse chat --local -c`
    /// keeps the prior turns (memory across questions — follow-ups work, so it
    /// feels like a real conversation, not disconnected one-shots) on the LOCAL
    /// Qwen, with the same per-turn note grounding. `--json` makes stdout a clean
    /// `{response, …}` object so the bubble shows just the reply — not the CLI's
    /// progress lines.
    public static func invocation(query: String, bin: String) -> MuseInvocation {
        MuseInvocation(executable: bin, arguments: ["chat", "--local", "-c", "--json", query])
    }

    /// One self-generated opener for the idle bubble. `muse companion-line`
    /// composes it DETERMINISTICALLY from the user's real stores (next event, a
    /// due reminder/task, today's birthday, an owed follow-up, a recent note) or —
    /// when nothing grounded is relevant — a varied content-free greeting. Cheap
    /// (file reads, no model round-trip), so it's fast enough to drift every ~45s
    /// and, unlike a generic chat prompt, it VARIES and stays grounded.
    public static func openerInvocation(lang: String, bin: String) -> MuseInvocation {
        MuseInvocation(executable: bin, arguments: ["companion-line", "--lang", lang])
    }

    /// One opener line + whether it was grounded in the user's real data, the
    /// VOICE it was spoken in (proactive / greeting / joke / tease / musing), and
    /// an optional grounded `topic` seed for click-to-act (the subject to open
    /// chat on). `topic` is empty for content-free modes.
    public struct OpenerLine: Equatable, Sendable {
        public let line: String
        public let grounded: Bool
        public let mode: String
        public let topic: String
        public init(line: String, grounded: Bool, mode: String = "greeting", topic: String = "") {
            self.line = line
            self.grounded = grounded
            self.mode = mode
            self.topic = topic
        }
    }

    private struct OpenerJSON: Decodable { let line: String?; let grounded: Bool?; let mode: String?; let topic: String? }

    /// Parse `muse companion-line`'s `{ line, grounded, mode, topic }` stdout.
    /// Returns nil when the output isn't the expected JSON or carries no line — so
    /// a CLI hiccup leaves the canned placeholder in place rather than showing
    /// garbage. `mode`/`topic` default when absent (older CLI).
    public static func parseOpener(_ raw: String) -> OpenerLine? {
        guard let data = raw.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(OpenerJSON.self, from: data) else {
            return nil
        }
        let line = (decoded.line ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !line.isEmpty else { return nil }
        return OpenerLine(
            line: line,
            grounded: decoded.grounded ?? false,
            mode: (decoded.mode ?? "greeting").trimmingCharacters(in: .whitespacesAndNewlines),
            topic: (decoded.topic ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    /// Run `muse companion-line` and return the parsed opener (nil on failure /
    /// empty). A non-zero CLI exit throws from `run`, which the caller treats as
    /// "keep the canned line".
    public static func opener(
        lang: String,
        bin: String = MuseBridge.defaultBin()
    ) async throws -> OpenerLine? {
        parseOpener(try run(openerInvocation(lang: lang, bin: bin)))
    }

    private struct ChatJSON: Decodable { let response: String?; let answer: String? }

    /// Extract the reply from `muse chat --json` (`response`) — or `ask --json`
    /// (`answer`) — stdout. Falls back to `cleanAnswer` (ANSI/whitespace strip)
    /// ONLY when the output isn't the expected JSON, so a CLI change degrades
    /// gracefully. When it IS the expected JSON but carries no answer (a model
    /// hiccup), return "" so the empty-answer UX fires — never leak the raw JSON
    /// object into the bubble (or have the Speaker read it aloud).
    public static func parseAnswer(_ raw: String) -> String {
        if let data = raw.data(using: .utf8), let decoded = try? JSONDecoder().decode(ChatJSON.self, from: data) {
            return (decoded.response ?? decoded.answer ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return cleanAnswer(raw)
    }

    /// Strip ANSI escape codes + surrounding whitespace (the non-JSON fallback,
    /// and the cleaner used before display).
    public static func cleanAnswer(_ raw: String) -> String {
        let stripped = raw.replacingOccurrences(
            of: "\u{1B}\\[[0-9;]*[A-Za-z]",
            with: "",
            options: .regularExpression
        )
        return stripped.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Run the Muse CLI for `query` and return its cleaned, cited answer.
    /// Throws on an empty query (no spawn) or a non-zero CLI exit.
    public static func ask(
        query: String,
        bin: String = MuseBridge.defaultBin()
    ) async throws -> String {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw MuseBridgeError.emptyQuery }
        return parseAnswer(try run(invocation(query: trimmed, bin: bin)))
    }

    /// The companion runs ALL DAY: keep the local Ollama model warm so a turn
    /// after an idle gap is instant, not a multi-second cold reload. Injects a
    /// generous `MUSE_OLLAMA_KEEP_ALIVE` default into the spawned CLI's
    /// environment — but the user's own value always wins. Pure + testable.
    public static func companionEnvironment(
        _ base: [String: String] = ProcessInfo.processInfo.environment
    ) -> [String: String] {
        var env = base
        let existing = env["MUSE_OLLAMA_KEEP_ALIVE"]?.trimmingCharacters(in: .whitespaces) ?? ""
        if existing.isEmpty {
            env["MUSE_OLLAMA_KEEP_ALIVE"] = "2h"
        }
        return env
    }

    static func run(_ invocation: MuseInvocation) throws -> String {
        let process = Process()
        // Resolve via `env` so a bare name like `muse` is found on PATH.
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [invocation.executable] + invocation.arguments
        // Keep the local model warm across idle gaps (always-on companion).
        process.environment = companionEnvironment()

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        try process.run()
        // Drain stderr concurrently: reading stdout to EOF first while the child
        // fills (and blocks on) a full stderr pipe would deadlock both sides.
        let group = DispatchGroup()
        var errData = Data()
        DispatchQueue.global(qos: .userInitiated).async(group: group) {
            errData = stderr.fileHandleForReading.readDataToEndOfFile()
        }
        let outData = stdout.fileHandleForReading.readDataToEndOfFile()
        group.wait()
        process.waitUntilExit()

        if process.terminationStatus != 0 {
            let err = String(data: errData, encoding: .utf8) ?? ""
            logFailure(status: process.terminationStatus, stderr: err, stdout: String(data: outData, encoding: .utf8) ?? "")
            throw MuseBridgeError.cliFailed(status: process.terminationStatus, stderr: err)
        }
        return String(data: outData, encoding: .utf8) ?? ""
    }

    /// Record a failed CLI turn so the intermittent "couldn't reach Muse CLI"
    /// error can be diagnosed (the real stderr is otherwise lost behind the
    /// generic message). Appends to `~/.muse/desktop-bridge.log`.
    private static func logFailure(status: Int32, stderr: String, stdout: String) {
        let head = { (s: String) in String(s.prefix(500)).replacingOccurrences(of: "\n", with: " ") }
        let line = "[\(ISO8601DateFormatter().string(from: Date()))] cliFailed status=\(status) stderr=\(head(stderr)) stdout=\(head(stdout))\n"
        let url = URL(fileURLWithPath: (NSHomeDirectory() as NSString).appendingPathComponent(".muse/desktop-bridge.log"))
        guard let data = line.data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: url) { handle.seekToEndOfFile(); handle.write(data); try? handle.close() }
        else { try? data.write(to: url) }
    }
}
