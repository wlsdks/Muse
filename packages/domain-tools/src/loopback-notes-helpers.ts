import { readdir as nodeReaddir, realpath as nodeRealpath } from "node:fs/promises";
import { basename as nodePathBasename, dirname as nodePathDirname, join as nodePathJoin, resolve as nodePathResolve, sep as nodePathSep } from "node:path";

/**
 * Path-validation, markdown-walk, and mirror-title helpers for the
 * `muse.notes` loopback MCP server. Split out of `loopback-notes.ts`
 * (which had grown past 700 LOC) to keep non-tool-definition logic out
 * of the file that holds the tool schemas.
 *
 * `NoteMirror` and `deriveMirrorNoteTitle` are re-exported from
 * `loopback-notes.ts` (which in turn is re-exported by
 * `packages/mcp/src/index.ts`), so no consumer import site changes.
 */

/**
 * One-way create-only mirror of a newly-created note into an external surface
 * (Apple Notes.app). Injected by the wiring layer so @muse/domain-tools stays
 * free of any macOS dependency — the exact sibling of the reminders
 * `ReminderMirror` seam. Fail-soft: a rejected/failed mirror NEVER fails the
 * Muse write; the returned `warning` is surfaced as `mirrorNote` in the tool
 * result instead.
 */
export type NoteMirror = (
  note: { readonly title: string; readonly body: string }
) => Promise<{ readonly mirrored: boolean; readonly warning?: string }>;

/**
 * Title for a mirrored note: the first Markdown heading in the leading lines,
 * else the file's basename stem. Deterministic + pure so the wiring layers and
 * their tests derive an identical title. Never empty (falls back to the raw
 * path, then a constant).
 */
export function deriveMirrorNoteTitle(relPath: string, content: string): string {
  for (const line of content.split(/\r?\n/u, 10)) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
    if (heading && heading[1] && heading[1].trim().length > 0) {
      return heading[1].trim();
    }
  }
  const base = relPath.split(/[\\/]/u).pop() ?? relPath;
  const stem = base.replace(/\.[^.]+$/u, "");
  return stem.length > 0 ? stem : (relPath.length > 0 ? relPath : "Muse note");
}

export interface NotesPathSafe {
  readonly absolute: string;
  readonly relative: string;
}

/**
 * Builds a sandboxed-path validator bound to `root`. A factory (rather than a
 * bare function taking `root` per call) so the closure the server factory
 * held inline becomes one relocatable unit — the validation logic below is
 * byte-identical to the original `resolveSafe` closure in `loopback-notes.ts`.
 */
/**
 * Collapse symlinks the way `@muse/fs` does: realpath the deepest EXISTING
 * ancestor and re-append the missing tail, so a not-yet-created note is handled
 * without requiring the leaf to exist. Without this, a symlink planted at
 * `<notesDir>/x.md` → `~/.ssh/id_rsa` passes the lexical containment check
 * (it resolves textually under the notes dir) and `readFile` then follows the
 * link and returns the target's bytes.
 */
async function canonicalizeUnderRoot(absolute: string): Promise<string> {
  let current = absolute;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = await nodeRealpath(current);
      return tail.length > 0 ? nodePathJoin(real, ...tail.reverse()) : real;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = nodePathDirname(current);
      if (parent === current) {
        return absolute;
      }
      tail.push(nodePathBasename(current));
      current = parent;
    }
  }
}

export function createNotesPathResolver(root: string): (input: string) => Promise<NotesPathSafe | string> {
  return async function resolveSafe(input: string): Promise<NotesPathSafe | string> {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return "path must not be empty";
    }
    if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(trimmed)) {
      return "path must be relative to the notes directory";
    }
    const lexical = nodePathResolve(root, trimmed);
    if (lexical !== root && !lexical.startsWith(root + nodePathSep)) {
      return "path escapes the notes directory";
    }
    // Re-check containment AFTER collapsing symlinks — the lexical check above
    // is defeated by a symlink whose target is outside the notes dir.
    const canonicalRoot = await canonicalizeUnderRoot(root);
    const absolute = await canonicalizeUnderRoot(lexical);
    if (absolute !== canonicalRoot && !absolute.startsWith(canonicalRoot + nodePathSep)) {
      return "path escapes the notes directory";
    }
    // Note paths are portable: forward-slash on every OS (matches the provider convention).
    const relative = absolute === canonicalRoot ? "" : absolute.slice(canonicalRoot.length + 1).split(nodePathSep).join("/");
    return { absolute, relative };
  };
}

export async function walkMarkdownFrom(
  root: string,
  dir: string,
  accept: (relPath: string) => void,
  visited: Set<string>
): Promise<void> {
  if (visited.has(dir)) {
    return;
  }
  visited.add(dir);
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await nodeReaddir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const childAbs = nodePathResolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFrom(root, childAbs, accept, visited);
    } else if (entry.isFile() && /\.(md|markdown|txt)$/iu.test(entry.name)) {
      accept(childAbs.slice(root.length + 1).split(nodePathSep).join("/"));
    }
  }
}
