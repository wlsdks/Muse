/**
 * MED-12 — extract image SOURCES (URLs + local paths) from freeform text
 * for vision routing. `muse ask --image` takes an explicit path today; this
 * is the deterministic extractor a future auto-route can build on.
 *
 * URLs reuse the SSRF-safe {@link extractPublicHttpUrls} (a private/loopback
 * lure never qualifies) and are filtered to image extensions. Local paths
 * are deliberately CONSERVATIVE — only path-shaped tokens (a `/`, `~/`,
 * `./`, `../` prefix) ending in an image extension qualify, so a bare
 * filename mentioned in prose ("see config.png") is NOT treated as an
 * attachment. Pure + synchronous; never reads the filesystem (a caller
 * still gates a path through fs-path-safety before loading it).
 */

import { extractPublicHttpUrls } from "./web-url-guard.js";

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|bmp|svg|heic)(?:[?#]\S*)?$/iu;
const LOCAL_IMAGE_PATH_RE =
  /(?:^|\s)((?:~|\.{0,2})\/[^\s'"<>]*?\.(?:png|jpe?g|gif|webp|bmp|svg|heic))(?=$|[\s'"<>)])/giu;

export interface ImageSources {
  readonly urls: readonly string[];
  readonly paths: readonly string[];
}

export function extractImageSources(text: string): ImageSources {
  const urls = extractPublicHttpUrls(text).filter((url) => IMAGE_EXT_RE.test(url));
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(LOCAL_IMAGE_PATH_RE)) {
    const path = match[1]!;
    if (!seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
  }
  return { paths, urls };
}
