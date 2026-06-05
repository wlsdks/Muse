import XCTest
@testable import MuseDesktopCore

final class MuseBridgeTests: XCTestCase {
    func testInvocationCallsLocalAskAsJSON() {
        let invocation = MuseBridge.invocation(query: "what's my office VPN MTU?", bin: "muse")
        XCTAssertEqual(invocation.executable, "muse")
        // `muse ask` is RAG-grounded on the local Qwen by default; `--json` gives
        // a clean structured answer (no progress lines / CLI hints in the bubble).
        XCTAssertEqual(invocation.arguments, ["ask", "--json", "what's my office VPN MTU?"])
    }

    func testParseAnswerExtractsTheAnswerFieldFromJSON() {
        let json = ##"{"query":"q","model":"ollama/qwen3:8b","answer":"  1380 bytes [from vpn.md]  ","grounded":{"noteChunks":[]}}"##
        XCTAssertEqual(MuseBridge.parseAnswer(json), "1380 bytes [from vpn.md]")
    }

    func testParseAnswerFallsBackToCleanAnswerForNonJSON() {
        // A CLI that isn't emitting the expected JSON (or an error string) still
        // shows something readable rather than nothing.
        XCTAssertEqual(MuseBridge.parseAnswer("\u{1B}[32mplain text\u{1B}[0m\n"), "plain text")
    }

    func testDefaultBinHonoursEnvOverride() {
        XCTAssertEqual(MuseBridge.defaultBin(environment: ["MUSE_BIN": "/opt/muse/bin/muse"]), "/opt/muse/bin/muse")
        XCTAssertEqual(MuseBridge.defaultBin(environment: ["MUSE_BIN": ""]), "muse")
        XCTAssertEqual(MuseBridge.defaultBin(environment: [:]), "muse")
    }

    func testCleanAnswerStripsAnsiAndTrims() {
        let raw = "\u{1B}[32m  1380 bytes [from vpn.md]\u{1B}[0m\n"
        XCTAssertEqual(MuseBridge.cleanAnswer(raw), "1380 bytes [from vpn.md]")
    }

    func testCleanAnswerLeavesPlainTextUntouched() {
        XCTAssertEqual(MuseBridge.cleanAnswer("Mortimer [from plant.md]"), "Mortimer [from plant.md]")
    }

    func testAskRejectsAnEmptyQueryWithoutSpawning() async {
        do {
            _ = try await MuseBridge.ask(query: "   ", bin: "muse")
            XCTFail("expected emptyQuery")
        } catch {
            XCTAssertEqual(error as? MuseBridgeError, .emptyQuery)
        }
    }
}
