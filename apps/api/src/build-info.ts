/**
 * Build identity for stale-server detection. The bundled desktop binary
 * bakes MUSE_BUILD_ID in at compile time (bun --define via
 * build-api-binary.mjs); a dev server has none and reports "dev", which
 * the desktop's reuse policy treats as an intentional developer override.
 */

const startedAtIso = new Date().toISOString();

export function serverBuildId(): string {
  const baked = process.env.MUSE_BUILD_ID?.trim();
  return baked && baked.length > 0 ? baked : "dev";
}

export function serverStartedAtIso(): string {
  return startedAtIso;
}
