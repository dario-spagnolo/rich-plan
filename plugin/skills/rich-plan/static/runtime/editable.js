/* Wire every .editable element for in-place text editing. The before/after
   snapshot drives the "modified" badge on the section and the diff in the
   submission payload.                                                    */

import { state } from "./state.js";
import { updateStatus } from "./submit.js";

export function setupEditable() {
  document.querySelectorAll(".editable").forEach((el, i) => {
    const id = el.dataset.editableId || `edit-${i}`;
    el.dataset.editableId = id;
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "true");

    const before = el.innerHTML.trim();
    const anchor = el.closest(".plan-section")?.id || "(root)";
    state.edits.set(el, { id, before, after: before, anchor, modified: false });

    el.addEventListener("input", () => {
      const entry = state.edits.get(el);
      entry.after = el.innerHTML.trim();
      entry.modified = entry.after !== entry.before;
      el.dataset.modified = entry.modified ? "true" : "false";
      const section = el.closest(".plan-section");
      if (section) {
        const anySectionEdit = [...state.edits.values()].some(
          (e) => e.anchor === section.id && e.modified
        );
        section.dataset.modified = anySectionEdit ? "true" : "false";
      }
      updateStatus();
    });
  });
}
