/* Section-level comment UI: a 💬 toggle in every section's top-right
   corner that opens an auto-saving textarea for general feedback on
   that section. Element-level commenting (code line, table cell, etc.)
   lives in granular.js.                                                 */

import { findCommentForTarget } from "./store.js";
import { installAutosave } from "./autosave.js";

export function setupComments() {
  document.querySelectorAll(".plan-section").forEach((section) => {
    if (!section.id) {
      section.id = "section-" + Math.random().toString(36).slice(2, 8);
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "rp-comment-toggle";
    toggle.innerHTML = "💬";
    section.appendChild(toggle);

    const panel = document.createElement("div");
    panel.className = "rp-comment-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <textarea placeholder="Comment on this section…" rows="3"></textarea>
      <div class="rp-comment-actions">
        <span class="rp-save-status" aria-live="polite"></span>
        <button type="button" class="rp-comment-delete" data-act="delete" hidden>Delete</button>
      </div>
    `;
    section.appendChild(panel);

    const textarea = panel.querySelector("textarea");
    const statusEl = panel.querySelector(".rp-save-status");
    const deleteBtn = panel.querySelector('[data-act="delete"]');

    const sectionTarget = {
      type: "section",
      element: section,
      text: null,
      locator: null,
      sectionId: section.id,
    };

    function getMyComment() {
      return findCommentForTarget(sectionTarget);
    }
    function refreshUI() {
      const has = !!getMyComment();
      toggle.classList.toggle("has-comments", has);
      deleteBtn.hidden = !has;
    }

    installAutosave({
      textarea,
      getTarget: () => sectionTarget,
      statusEl,
      onAfterSave: refreshUI,
    });

    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (panel.hidden) return;
      textarea.value = getMyComment()?.text || "";
      refreshUI();
      setTimeout(() => {
        textarea.scrollIntoView({ behavior: "smooth", block: "center" });
        textarea.focus();
      }, 50);
    });

    deleteBtn.addEventListener("click", () => {
      textarea.value = "";
      textarea.dispatchEvent(new Event("input", { bubbles: false }));
    });

    refreshUI();
  });
}
