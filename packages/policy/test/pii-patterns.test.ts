import { describe, expect, it } from "vitest";
import {
  allPiiPatterns,
  commonPiiPatterns,
  internationalPiiPatterns,
  krPiiPatterns,
  maskPii
} from "../src/index.js";

describe("PII patterns", () => {
  it("keeps specific patterns before common patterns", () => {
    expect(allPiiPatterns.map((pattern) => pattern.name)).toEqual([
      ...krPiiPatterns.map((pattern) => pattern.name),
      ...internationalPiiPatterns.map((pattern) => pattern.name),
      ...commonPiiPatterns.map((pattern) => pattern.name)
    ]);
  });

  it("masks representative private identifiers", () => {
    const result = maskPii(
      [
        "person@example.com",
        "010-1234-5678",
        "1234-5678-9012-3456",
        "192.168.1.100",
        "712020:fd33c992-4363-499e-b10a-d51ff76fcff2"
      ].join(" ")
    );

    expect(result.text).toContain("***@***.***");
    expect(result.text).toContain("***-****-****");
    expect(result.text).toContain("****-****-****-****");
    expect(result.text).toContain("***.***.***.***");
    expect(result.text).toContain("***:****-****-****-****-************");
  });
});
