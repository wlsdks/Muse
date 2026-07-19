/**
 * Hash-based view routing. The top-level view lived only in React state
 * (useState), so a refresh or a browser back/forward always landed back on
 * chat — this syncs it to `location.hash` (e.g. "#/tasks") instead. Pure
 * string-in/string-out so the parse/validate contract is unit-testable
 * without a DOM or a real `window`.
 */

export type ViewId =
  | "home"
  | "chat"
  | "chats"
  | "tasks"
  | "board"
  | "agents"
  | "calendar"
  | "reminders"
  | "messaging"
  | "integrations"
  | "notes"
  | "continuity"
  | "journey"
  | "activity"
  | "autonomy"
  | "flows"
  | "work"
  | "dashboard"
  | "tools"
  | "mcp"
  | "self-improvement"
  | "skills"
  | "prompt-lab"
  | "scheduler"
  | "settings";

export const VIEW_IDS: readonly ViewId[] = [
  "home",
  "chat",
  "chats",
  "tasks",
  "board",
  "agents",
  "calendar",
  "reminders",
  "messaging",
  "integrations",
  "notes",
  "continuity",
  "journey",
  "activity",
  "autonomy",
  "flows",
  "work",
  "dashboard",
  "tools",
  "mcp",
  "self-improvement",
  "skills",
  "prompt-lab",
  "scheduler",
  "settings"
];

const DEFAULT_VIEW: ViewId = "chat";

function isViewId(value: string): value is ViewId {
  return (VIEW_IDS as readonly string[]).includes(value);
}

/** Parses `location.hash` ("#/tasks", "#tasks", "", "#/", "#/bogus", ...)
 * into a known view id. Anything empty, malformed, or unrecognized falls
 * back to the default view — a stale bookmark or a hand-edited garbage
 * hash never crashes or blanks the page. */
export function viewFromHash(hash: string): ViewId {
  const stripped = hash.replace(/^#\/?/, "");
  return isViewId(stripped) ? stripped : DEFAULT_VIEW;
}

export function hashForView(id: ViewId): string {
  return `#/${id}`;
}
