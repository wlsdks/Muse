/**
 * User-driven sidebar (LNB) collapse: persist the choice and derive the
 * shell class. Collapsed = the sidebar narrows to an icon rail (the same
 * look the ≤860px responsive breakpoint already produces), giving the main
 * view — the Builder canvas above all — more room without losing nav.
 *
 * Pure + storage-injected so the persistence contract and the class
 * derivation are unit-testable without a DOM or a real `window`.
 */

const STORAGE_KEY = "muse.sidebarCollapsed";

export function readSidebarCollapsed(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(storage: Pick<Storage, "setItem"> | undefined, collapsed: boolean): void {
  try {
    storage?.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* storage unavailable — collapse stays a session-only preference */
  }
}

export function shellClassName(collapsed: boolean): string {
  return collapsed ? "shell sidebar-collapsed" : "shell";
}
