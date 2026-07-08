import XCTest
@testable import MuseDesktopCore

final class CompanionSeedTests: XCTestCase {
    func testEmptyTopicLeavesTheBaseUrlUnchanged() {
        XCTAssertEqual(CompanionSeed.url(base: "http://127.0.0.1:5173/", topic: ""), "http://127.0.0.1:5173/")
        XCTAssertEqual(CompanionSeed.url(base: "http://127.0.0.1:5173/", topic: "   "), "http://127.0.0.1:5173/")
    }

    func testGroundedTopicIsAppendedAsAnEncodedSeedQuery() {
        let url = CompanionSeed.url(base: "http://127.0.0.1:5173/", topic: "submit the Q3 memo")
        XCTAssertTrue(url.hasPrefix("http://127.0.0.1:5173/?"))
        XCTAssertTrue(url.contains("companion_seed=submit%20the%20Q3%20memo"))
    }

    func testSeedMergesWithAnExistingQuery() {
        let url = CompanionSeed.url(base: "http://host/app?tab=chat", topic: "call mom")
        XCTAssertTrue(url.contains("tab=chat"))
        XCTAssertTrue(url.contains("companion_seed=call%20mom"))
    }

    func testTopicIsPercentEncodedSoOddCharactersStayValid() {
        let url = CompanionSeed.url(base: "http://127.0.0.1:5173/", topic: "a & b = c?")
        XCTAssertTrue(url.contains("companion_seed="))
        XCTAssertFalse(url.contains("a & b")) // raw spaces/ampersands are encoded, never left bare
    }

    func testEmptyBaseAndTopicYieldsEmptyString() {
        XCTAssertEqual(CompanionSeed.url(base: "", topic: ""), "")
    }
}
