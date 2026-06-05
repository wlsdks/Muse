import XCTest
@testable import MuseDesktopCore

final class AnswerPresentationTests: XCTestCase {
    func testSpeaksAnswerButDropsCitationMarkers() {
        let p = MusePresenter.present(.success("The office VPN MTU is 1380 bytes. [from vpn.md]"))
        XCTAssertEqual(p.bubbleText, "The office VPN MTU is 1380 bytes. [from vpn.md]") // bubble keeps the citation
        XCTAssertEqual(p.speechText, "The office VPN MTU is 1380 bytes.")               // speech drops it
    }

    func testStripsEveryCitationMarker() {
        XCTAssertEqual(MusePresenter.stripCitationsForSpeech("A [from a.md] and B [from b.md]"), "A and B")
    }

    func testStaysSilentOnEmptyAnswer() {
        let p = MusePresenter.present(.success("   "))
        XCTAssertNil(p.speechText)
        XCTAssertFalse(p.bubbleText.isEmpty)
    }

    func testStaysSilentOnCliFailure() {
        let p = MusePresenter.present(.failure(.cliFailed(status: 1, stderr: "boom")))
        XCTAssertNil(p.speechText)
        XCTAssertTrue(p.bubbleText.contains("couldn't reach"))
    }
}

final class MuseSpriteTests: XCTestCase {
    func testSpriteIsACleanRectangle() {
        XCTAssertTrue(MuseSprite.isRectangular())
        XCTAssertEqual(MuseSprite.width, 14)
        XCTAssertEqual(MuseSprite.height, 16)
    }

    func testSpriteHasAFaceAndDress() {
        let all = MuseSprite.rows.joined()
        XCTAssertTrue(all.contains("e")) // eyes
        XCTAssertTrue(all.contains("m")) // lips
        XCTAssertTrue(all.contains("G")) // gold laurel
        XCTAssertTrue(all.contains("D")) // dress
    }

    func testAnimationOverrideRowsLineUp() {
        XCTAssertEqual(MuseSprite.closedEyesRow.count, MuseSprite.width)
        XCTAssertEqual(MuseSprite.openMouthRow.count, MuseSprite.width)
        XCTAssertLessThan(MuseSprite.eyeRowIndex, MuseSprite.height)
        XCTAssertLessThan(MuseSprite.mouthRowIndex, MuseSprite.height)
    }
}
