import XCTest
@testable import MuseDesktopCore

final class ServerReusePolicyTests: XCTestCase {
    func testNoBundleIdAlwaysReuses() {
        XCTAssertTrue(ServerReusePolicy.shouldReuse(bundledBuildId: nil, reportedVersion: nil))
        XCTAssertTrue(ServerReusePolicy.shouldReuse(bundledBuildId: "", reportedVersion: "anything"))
    }

    func testVersionlessServerIsStale() {
        // The 2026-07-12 incident class: a weeks-old binary answering
        // /api/health without a version field must be replaced.
        XCTAssertFalse(ServerReusePolicy.shouldReuse(bundledBuildId: "abc123", reportedVersion: nil))
        XCTAssertFalse(ServerReusePolicy.shouldReuse(bundledBuildId: "abc123", reportedVersion: ""))
    }

    func testMatchingBuildIdReuses() {
        XCTAssertTrue(ServerReusePolicy.shouldReuse(bundledBuildId: "abc123", reportedVersion: "abc123"))
    }

    func testMismatchedBuildIdReplaces() {
        XCTAssertFalse(ServerReusePolicy.shouldReuse(bundledBuildId: "abc123", reportedVersion: "def456"))
    }

    func testDevServerIsDeliberateOverride() {
        XCTAssertTrue(ServerReusePolicy.shouldReuse(bundledBuildId: "abc123", reportedVersion: "dev"))
    }
}
