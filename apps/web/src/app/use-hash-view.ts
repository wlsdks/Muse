import { useCallback, useEffect, useState } from "react";

import { hashForView, viewFromHash } from "../lib/view-route.js";

import type { ViewId } from "../lib/view-route.js";

/**
 * Syncs the top-level view to `location.hash` so a reload or a browser
 * back/forward doesn't lose it. Returns `[view, updateView]` — `updateView`
 * is the one path every view change should go through so the hash always
 * reflects `view` (sidebar clicks, leader shortcuts, the command palette,
 * `onNavigate` callbacks). Window-safe (SSR / no-DOM test contexts read
 * back the default view) like the rest of this module's siblings.
 */
export function useHashView(): readonly [ViewId, (id: ViewId) => void] {
  const [view, setView] = useState<ViewId>(() => (typeof window === "undefined" ? "chat" : viewFromHash(window.location.hash)));

  const updateView = useCallback((id: ViewId) => {
    setView(id);
    if (typeof window !== "undefined") {
      const target = hashForView(id);
      if (window.location.hash !== target) {
        window.location.hash = target;
      }
    }
  }, []);

  // Keeps `view` and `location.hash` in sync for the two things `updateView`
  // can't cover: a browser back/forward (`hashchange`) restoring a prior
  // view, and normalizing an initial hash that was empty or garbage to the
  // view we actually resolved (`viewFromHash`'s fallback) so the address
  // bar never disagrees with what's rendered. Uses `replaceState` (not
  // `location.hash =`) for that normalization so it doesn't fire a second
  // `hashchange` or add a spurious history entry.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const syncHash = (id: ViewId) => {
      const target = hashForView(id);
      if (window.location.hash !== target) {
        window.history.replaceState(null, "", target);
      }
    };
    syncHash(view);
    const onHashChange = () => {
      const next = viewFromHash(window.location.hash);
      setView(next);
      syncHash(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return [view, updateView] as const;
}
