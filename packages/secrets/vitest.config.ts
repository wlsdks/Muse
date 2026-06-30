import { defineConfig } from "vitest/config";

// vitest 4 dropped `**/dist/**` from its default test exclude, so the
// `tsc`-compiled copies of `src`-colocated test files would be collected
// alongside the originals — running every test twice against stale compiled
// output. Restore the exclude.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});
