/* Shared auto-save helper for comment textareas. Wires an `input`
   listener that, after a debounce, calls upsertComment(target, value)
   and reflects the outcome in a status element ("Saving…" → "Saved" →
   fade). The target is resolved lazily via getTarget() so the popover
   in granular.js can recycle a single textarea across many targets.    */

import { upsertComment } from "./store.js";
import { updateStatus } from "../submit.js";

export function installAutosave({
  textarea,
  getTarget,
  statusEl = null,
  onAfterSave = null,
  debounceMs = 500,
}) {
  let saveTimer = null;
  let flashTimer = null;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }
  function flash(text, ms = 1200) {
    setStatus(text);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => setStatus(""), ms);
  }

  function commit() {
    const target = getTarget();
    if (!target) return null;
    const result = upsertComment(target, textarea.value);
    updateStatus();
    if (result.action === "delete") flash("Deleted");
    else if (result.action === "noop") setStatus("");
    else flash("Saved");
    onAfterSave?.(result);
    return result;
  }

  textarea.addEventListener("input", () => {
    setStatus("Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      commit();
    }, debounceMs);
  });

  return {
    /* Drop a pending save without committing — used when the popover is
       closed via Cancel-style flow (rare; we keep it for completeness). */
    cancelPending() {
      clearTimeout(saveTimer);
      saveTimer = null;
      setStatus("");
    },
    /* Force-commit any pending save immediately. */
    flushNow() {
      if (!saveTimer) return null;
      clearTimeout(saveTimer);
      saveTimer = null;
      return commit();
    },
    /* Manually trigger a save (e.g. Delete button) regardless of the
       textarea's current content. */
    saveNow() {
      clearTimeout(saveTimer);
      saveTimer = null;
      return commit();
    },
    /* Reset internal timers + status — useful when the popover is
       repointed at a different target. */
    reset() {
      clearTimeout(saveTimer);
      clearTimeout(flashTimer);
      saveTimer = null;
      setStatus("");
    },
  };
}
