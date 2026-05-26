import { useEffect } from "react";

/**
 * Global keyboard shortcuts. `⌘K` / `Ctrl+K` toggles the command
 * palette; a Vim-style `g` leader followed by a letter jumps to a view
 * (`onLeader("t")` etc). Ignores keystrokes typed into inputs so it
 * never hijacks the chat composer or a search box.
 */
export function useShortcuts(opts: {
  onTogglePalette: () => void;
  onLeader: (key: string) => void;
}): void {
  const { onLeader, onTogglePalette } = opts;

  useEffect(() => {
    let leaderUntil = 0;

    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) {
        return false;
      }
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onTogglePalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) {
        return;
      }
      const now = Date.now();
      if (e.key === "g") {
        leaderUntil = now + 1000;
        return;
      }
      if (now < leaderUntil && /^[a-z]$/.test(e.key)) {
        leaderUntil = 0;
        onLeader(e.key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onLeader, onTogglePalette]);
}
