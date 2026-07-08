import XCTest
import CoreGraphics
@testable import MuseDesktopCore

final class WindowPlacementTests: XCTestCase {
    func testTestModeRecognisesTruthyValues() {
        for v in ["1", "true", "TRUE", "yes", "on"] {
            XCTAssertTrue(WindowPlacement.isTestMode(["MUSE_DESKTOP_TEST": v]), "\(v) should enable test mode")
        }
        XCTAssertFalse(WindowPlacement.isTestMode(["MUSE_DESKTOP_TEST": "0"]))
        XCTAssertFalse(WindowPlacement.isTestMode([:]))
    }

    func testDisplayChoiceDefaultsToMouseButTestModeForcesMain() {
        XCTAssertEqual(WindowPlacement.displayChoice([:]), .mouse)
        XCTAssertEqual(WindowPlacement.displayChoice(["MUSE_WINDOW_DISPLAY": "main"]), .main)
        XCTAssertEqual(WindowPlacement.displayChoice(["MUSE_WINDOW_DISPLAY": "mouse"]), .mouse)
        // Test mode wins over an explicit mouse request — determinism first.
        XCTAssertEqual(
            WindowPlacement.displayChoice(["MUSE_DESKTOP_TEST": "1", "MUSE_WINDOW_DISPLAY": "mouse"]),
            .main
        )
    }

    func testCenteredOriginCentersWithinVisibleFrame() {
        let frame = CGRect(x: 0, y: 0, width: 1000, height: 800)
        let origin = WindowPlacement.centeredOrigin(inVisibleFrame: frame, windowSize: CGSize(width: 440, height: 520))
        XCTAssertEqual(origin.x, (1000 - 440) / 2, accuracy: 0.001)
        XCTAssertEqual(origin.y, (800 - 520) / 2, accuracy: 0.001)
    }

    func testCenteredOriginRespectsNonZeroFrameOrigin() {
        // A secondary display at a negative offset must still center on ITS frame.
        let frame = CGRect(x: -1440, y: -900, width: 1440, height: 900)
        let origin = WindowPlacement.centeredOrigin(inVisibleFrame: frame, windowSize: CGSize(width: 400, height: 300))
        XCTAssertEqual(origin.x, frame.midX - 200, accuracy: 0.001)
        XCTAssertEqual(origin.y, frame.midY - 150, accuracy: 0.001)
    }

    func testExplicitOriginParsesOrRejects() {
        let p = WindowPlacement.explicitOrigin(["MUSE_WINDOW_ORIGIN": "120, 340"])
        XCTAssertEqual(p?.x, 120)
        XCTAssertEqual(p?.y, 340)
        XCTAssertNil(WindowPlacement.explicitOrigin([:]))
        XCTAssertNil(WindowPlacement.explicitOrigin(["MUSE_WINDOW_ORIGIN": "nope"]))
        XCTAssertNil(WindowPlacement.explicitOrigin(["MUSE_WINDOW_ORIGIN": "1,2,3"]))
    }
}
