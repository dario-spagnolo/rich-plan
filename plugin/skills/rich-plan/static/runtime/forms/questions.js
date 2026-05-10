/* Multiple-choice question forms (<form class="rich-question">). The
   default option is the radio that carries the `checked` attribute (set
   by the author in markup). A free-text "Other:" row is auto-injected
   unless data-allow-free="false". The shared radio `name` becomes the
   question id in submission.json.

   Questions are also numbered (Q1, Q2, …) and individually commentable
   — each question gets a 💬 toggle in its top-right corner that opens
   an inline auto-saving panel.                                         */

import { state } from "../state.js";
import { updateStatus } from "../submit.js";
import { findCommentForTarget } from "../comments/store.js";
import { installAutosave } from "../comments/autosave.js";

export function setupQuestions() {
  document.querySelectorAll(".rich-question").forEach((q, i) => {
    const id = q.dataset.questionId || `q-${i}`;
    q.dataset.questionId = id;
    const defaultValue = q.dataset.default;
    const allowFree = q.dataset.allowFree !== "false";
    const promptEl = q.querySelector(".q-prompt");
    const promptText = promptEl?.textContent.trim() || null;

    /* Inject the Q-number badge into the prompt (visual replacement for
       the old "?" pseudo-element). Idempotent. */
    if (promptEl && !promptEl.querySelector(".q-number")) {
      const numEl = document.createElement("span");
      numEl.className = "q-number";
      numEl.textContent = `Q${i + 1}`;
      promptEl.insertBefore(numEl, promptEl.firstChild);
    }

    /* Wrap each label's post-radio content into a single <span>. With
       `display: flex; gap: 8px` on the label, every direct child becomes
       a flex item — including text nodes between inline tags — which
       fragments the prose and inserts spurious gaps. Collapsing
       everything after the radio into one <span class="q-option-text">
       restores normal inline wrap.                                     */
    q.querySelectorAll("label").forEach((label) => {
      if (label.querySelector(":scope > .q-option-text")) return;
      const radio = label.querySelector(':scope > input[type="radio"]');
      if (!radio) return;
      const span = document.createElement("span");
      span.className = "q-option-text";
      let n = radio.nextSibling;
      while (n) {
        const next = n.nextSibling;
        span.appendChild(n);
        n = next;
      }
      label.appendChild(span);
    });

    /* Pre-check the default radio */
    if (defaultValue) {
      const radio = q.querySelector(`input[type="radio"][value="${CSS.escape(defaultValue)}"]`);
      if (radio) radio.checked = true;
    }

    /* Tag the default option visually */
    q.querySelectorAll('input[type="radio"]').forEach((r) => {
      if (r.value === defaultValue) {
        const label = r.closest("label");
        if (label && !label.querySelector(".q-default-tag")) {
          const tag = document.createElement("span");
          tag.className = "q-default-tag";
          tag.textContent = "default";
          label.appendChild(tag);
        }
      }
    });

    /* Inject the "Other:" row */
    let otherInput = q.querySelector('input[name="other"]');
    if (allowFree && !otherInput) {
      const row = document.createElement("div");
      row.className = "q-other-row";
      row.innerHTML = `
        <input type="radio" name="${id}" value="__other__" id="${id}-other">
        <label for="${id}-other" style="font-size:0.9em;color:var(--rp-text-muted);">Other:</label>
        <input type="text" name="other" placeholder="free-form answer…">
      `;
      q.appendChild(row);
      otherInput = row.querySelector('input[name="other"]');
    }

    /* Capture initial state (so the default lands in the payload even if
       the user submits without touching anything). */
    const initialValue = defaultValue
      || (q.querySelector('input[type="radio"]:checked')?.value);
    const baseFields = { prompt: promptText, default: defaultValue || null };
    if (initialValue) {
      state.questions.set(id, { ...baseFields, value: initialValue, isFree: false });
    }

    q.addEventListener("change", () => {
      const checked = q.querySelector('input[type="radio"]:checked');
      if (!checked) return;
      if (checked.value === "__other__") {
        state.questions.set(id, { ...baseFields, value: otherInput?.value || "", isFree: true });
      } else {
        state.questions.set(id, { ...baseFields, value: checked.value, isFree: false });
      }
      updateStatus();
    });

    if (otherInput) {
      otherInput.addEventListener("input", () => {
        const otherRadio = q.querySelector(`input[name="${id}"][value="__other__"]`);
        if (otherRadio) otherRadio.checked = true;
        state.questions.set(id, { ...baseFields, value: otherInput.value, isFree: true });
        updateStatus();
      });
    }

    /* --- Per-question comment UI --------------------------------------- */
    setupQuestionCommentUI(q, id, promptText);
  });
}

/* Toggle 💬 + inline auto-saving panel anchored to a single question.   */
function setupQuestionCommentUI(q, questionId, promptText) {
  const sectionId = q.closest(".plan-section")?.id
    || (q.closest(".plan-header") ? "(header)" : "(root)");

  const target = {
    type: "question",
    element: q,
    text: promptText,
    locator: { question_id: questionId },
    sectionId,
  };

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "rp-comment-toggle rp-question-comment-toggle";
  toggle.innerHTML = "💬";
  toggle.title = "Comment on this question";
  q.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "rp-comment-panel rp-question-comment-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <textarea placeholder="Comment on this question…" rows="3"></textarea>
    <div class="rp-comment-actions">
      <span class="rp-save-status" aria-live="polite"></span>
      <button type="button" class="rp-comment-delete" data-act="delete" hidden>Delete</button>
    </div>
  `;
  q.appendChild(panel);

  const textarea = panel.querySelector("textarea");
  const statusEl = panel.querySelector(".rp-save-status");
  const deleteBtn = panel.querySelector('[data-act="delete"]');

  function getMyComment() {
    return findCommentForTarget(target);
  }
  function refreshUI() {
    const has = !!getMyComment();
    toggle.classList.toggle("has-comments", has);
    deleteBtn.hidden = !has;
  }

  installAutosave({
    textarea,
    getTarget: () => target,
    statusEl,
    onAfterSave: refreshUI,
  });

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    textarea.value = getMyComment()?.text || "";
    refreshUI();
    setTimeout(() => textarea.focus(), 0);
  });

  deleteBtn.addEventListener("click", () => {
    textarea.value = "";
    /* Trigger the same save path so status flashes "Deleted" naturally.
       upsertComment() with empty text removes the comment. */
    textarea.dispatchEvent(new Event("input", { bubbles: false }));
  });

  refreshUI();
}
