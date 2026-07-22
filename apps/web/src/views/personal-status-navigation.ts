import { safeSessionStorage } from "../lib/safe-storage.js";

export type PersonalStatusFocus = "continuity-feedback-review" | "learning-history" | "vetoes";
export type PersonalStatusFocusView = "continuity" | "journey" | "autonomy";

const KEY = "muse.personal-status.focus.v1";

export function writePersonalStatusFocus(view: PersonalStatusFocusView, focus: PersonalStatusFocus): void {
  safeSessionStorage()?.setItem(KEY, JSON.stringify({ focus, view }));
}

export function consumePersonalStatusFocus(view: PersonalStatusFocusView): PersonalStatusFocus | undefined {
  const storage = safeSessionStorage();
  const raw = storage?.getItem(KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { readonly focus?: unknown; readonly view?: unknown };
    if (parsed.view !== view || typeof parsed.focus !== "string") return undefined;
    storage?.removeItem(KEY);
    return parsed.focus as PersonalStatusFocus;
  } catch {
    storage?.removeItem(KEY);
    return undefined;
  }
}

export function focusPersonalStatusTarget(id: PersonalStatusFocus | "memory-reconfirm"): void {
  if (typeof document === "undefined") return;
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  });
}
