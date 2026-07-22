import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliSrc = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(cliSrc, "../../..");
const PURE_FILES = [
  join(cliSrc, "daemon-workload-governor.ts"),
  join(cliSrc, "daemon-resource-admission.ts"),
  join(cliSrc, "daemon-resource-receipt.ts"),
  join(cliSrc, "daemon-resource-status.ts"),
  join(repoRoot, "packages/macos/src/system-resource-observation.ts")
];
const ALLOWED_EXTERNAL = new Set([
  "@muse/macos/system-resource-observation",
  "@muse/stores/atomic-file-store"
]);

function importSpecifiers(source: string): readonly string[] {
  return [...source.matchAll(/^\s*(?:(?:import|export)\b[^\n]*?\bfrom\s+|import\s*\()(["'])(?<specifier>[^"']+)\1/gmu)]
    .map((match) => match.groups?.specifier)
    .filter((value): value is string => value !== undefined);
}

function resolveLocalImport(fromFile: string, specifier: string): string | undefined {
  const candidate = resolve(dirname(fromFile), specifier);
  const candidates = candidate.endsWith(".js")
    ? [`${candidate.slice(0, -3)}.ts`, `${candidate.slice(0, -3)}.tsx`]
    : [candidate, `${candidate}.ts`, `${candidate}.tsx`, join(candidate, "index.ts")];
  return candidates.find((path) => existsSync(path));
}

describe("daemon workload pure dependency boundary", () => {
  it("loads no model, provider, browser, messaging, email, prompt, content-store, or broad package barrel", () => {
    const violations: string[] = [];
    const pending = [...PURE_FILES];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const file = pending.pop();
      if (file === undefined || visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith("node:") || ALLOWED_EXTERNAL.has(specifier)) continue;
        if (specifier.startsWith(".")) {
          const localImport = resolveLocalImport(file, specifier);
          if (localImport === undefined) violations.push(`${file}: unresolved ${specifier}`);
          else pending.push(localImport);
          continue;
        }
        violations.push(`${file}: ${specifier}`);
      }
      expect(source).not.toMatch(/\b(?:require|eval)\s*\(/u);
    }
    expect(violations).toEqual([]);
  });
});
