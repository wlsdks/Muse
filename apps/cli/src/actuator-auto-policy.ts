/**
 * Which actuators `auto` mode may run WITHOUT a confirm.
 *
 * The classification is not read/write/execute — that grouping is about the
 * runtime's own gating and it puts `mac_say` next to `mac_shortcut_run`, which
 * are nothing alike. The question here is narrower and more useful:
 *
 *   if this fires wrongly, can the user put it back?
 *
 * Three properties must ALL hold for a tool to auto-run:
 *   1. no third party receives anything,
 *   2. the effect is VISIBLE — the user notices it happened,
 *   3. the user can undo it themselves, in seconds, without Muse.
 *
 * Anything failing one of those confirms, exactly as in `ask` mode. The list
 * is an ALLOWLIST, so a newly added actuator confirms by default until someone
 * deliberately classifies it — a new tool must never inherit auto-run.
 *
 * Reasoning for the exclusions, since they are the load-bearing part:
 *
 *   mac_shortcut_run  — its own description calls it "the bridge to anything
 *                       the user has automated in Shortcuts (opening apps,
 *                       setting scenes, files, web requests)". Reversibility
 *                       depends on the shortcut's CONTENTS, which cannot be
 *                       inspected. Unknowable ⇒ treated as irreversible.
 *   mac_system_set    — sleeps the Mac, drops wifi, toggles Focus. Muse cannot
 *                       wake a sleeping Mac to undo its own mistake.
 *   mac_clipboard_set — silently destroys what the user was about to paste.
 *                       Small, but there is no undo and no notification.
 *   mac_contacts_write— fails the VISIBILITY test: a silently-edited contact
 *                       is not noticed until a message goes to the wrong
 *                       number. It also feeds mac_message_send's recipient
 *                       resolution, so a corrupted contact changes where a
 *                       later send GOES. Not a local write.
 *   email_* / web_action / mac_message_send — third party, no undo.
 */

export const AUTO_RUNNABLE_ACTUATORS: readonly string[] = [
  // Read-only: nothing to undo.
  "mac_screen_read",
  "mac_app_read",
  "mac_spotlight_search",
  // Visible, self-reversing, local-only.
  "mac_say",
  "mac_screenshot",
  "mac_media_control",
  "mac_app_open"
];

/**
 * True when `auto` mode may run this tool with no confirm. Every other
 * actuator — including any tool not in the list at all — keeps the `ask`
 * behaviour.
 */
export function isAutoRunnableActuator(toolName: string): boolean {
  return AUTO_RUNNABLE_ACTUATORS.includes(toolName);
}
