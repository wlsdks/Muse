import XCTest
@testable import MuseDesktopCore

final class MuseBridgeTests: XCTestCase {
    func testInvocationCallsLocalAsk() {
        let invocation = MuseBridge.invocation(query: "what's my office VPN MTU?", bin: "muse")
        XCTAssertEqual(invocation.executable, "muse")
        // `muse ask` is RAG-grounded on the local Qwen by default (and rejects
        // `--local`, which is a `chat` flag) — so the args are just ask + query.
        XCTAssertEqual(invocation.arguments, ["ask", "what's my office VPN MTU?"])
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
