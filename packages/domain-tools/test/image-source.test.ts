import { describe, expect, it } from "vitest";

import { extractImageSources } from "../src/index.js";

describe("extractImageSources (MED-12)", () => {
  it("extracts image URLs and excludes non-image URLs", () => {
    const r = extractImageSources("look at https://cdn.example.com/a.png and https://example.com/page");
    expect(r.urls).toEqual(["https://cdn.example.com/a.png"]);
  });

  it("keeps an image URL with a query string", () => {
    expect(extractImageSources("https://cdn.example.com/a.jpg?w=200").urls).toEqual(["https://cdn.example.com/a.jpg?w=200"]);
  });

  it("drops an SSRF/loopback image URL (composes the SSRF guard)", () => {
    expect(extractImageSources("http://169.254.169.254/x.png and http://localhost/y.png").urls).toEqual([]);
  });

  it("extracts path-shaped local image refs (~/, ./, ../, /abs)", () => {
    const r = extractImageSources("try ~/pics/a.png or ./img/b.jpeg or ../c.gif or /abs/d.webp");
    expect(r.paths).toEqual(["~/pics/a.png", "./img/b.jpeg", "../c.gif", "/abs/d.webp"]);
  });

  it("does NOT treat a bare filename in prose as a path", () => {
    expect(extractImageSources("the file config.png describes it").paths).toEqual([]);
  });

  it("de-duplicates and returns empty arrays when there are no image sources", () => {
    expect(extractImageSources("/x/a.png and again /x/a.png").paths).toEqual(["/x/a.png"]);
    expect(extractImageSources("no images here")).toEqual({ paths: [], urls: [] });
  });
});
