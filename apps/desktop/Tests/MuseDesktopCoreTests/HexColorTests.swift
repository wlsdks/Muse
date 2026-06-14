import XCTest
@testable import MuseDesktopCore

/// The sprite renderer maps every palette hex through this parser; a hex it
/// can't parse renders a transparent hole. The parse logic (3/6/8-digit forms,
/// invalid chars, wrong length, the alpha-zero transparent convention) was
/// untested AppKit code — pulled into Core so the renderer's contract is locked.
final class HexColorTests: XCTestCase {
    func testParsesSixDigit() {
        XCTAssertEqual(parseHexColor("#f4c9a8"), RGBA(r: 0xF4 / 255, g: 0xC9 / 255, b: 0xA8 / 255, a: 1))
    }

    func testHashIsOptional() {
        XCTAssertEqual(parseHexColor("f4c9a8"), parseHexColor("#f4c9a8"))
    }

    func testExpandsThreeDigit() {
        XCTAssertEqual(parseHexColor("#abc"), RGBA(r: 0xA / 15, g: 0xB / 15, b: 0xC / 15, a: 1))
    }

    func testEightDigitCarriesAlpha() {
        XCTAssertEqual(parseHexColor("#ff000080"), RGBA(r: 1, g: 0, b: 0, a: 0x80 / 255))
    }

    func testTransparentIsValidNotNil() {
        // "#00000000" is the deliberate transparent-cell convention — a VALID
        // hex (the renderer separately decides to skip alpha-zero cells).
        XCTAssertEqual(parseHexColor("#00000000"), RGBA(r: 0, g: 0, b: 0, a: 0))
    }

    func testRejectsInvalidCharsWrongLengthAndEmpty() {
        XCTAssertNil(parseHexColor("#GG0000"))
        XCTAssertNil(parseHexColor("#12345"))   // 5 digits — not 3/6/8
        XCTAssertNil(parseHexColor("#"))
        XCTAssertNil(parseHexColor("nope"))
    }

    func testTrimsWhitespace() {
        XCTAssertEqual(parseHexColor("  #ffffff  "), RGBA(r: 1, g: 1, b: 1, a: 1))
    }
}
