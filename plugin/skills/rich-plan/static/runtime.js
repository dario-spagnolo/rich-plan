/* ===== rich-plan : runtime entry point ================================
   Wires the discrete subsystems together. Conventions are documented in
   SKILL.md and refs/conventions/*.md. The plan author writes plain HTML;
   each setup function below discovers elements by class / data-attrs and
   makes them interactive.

   Bootstrap order matters:
   1. setupTheme          — resolves data-theme, mounts the toggle, emits
                            rp:theme-change so highlight/mermaid can react
   2. normalize           — fills in default classes, ids, editable flags
   3. renderDiffs         — turn raw diffs into spans before highlight.js
                            sees them
   4. setupEditable       — must run after normalize tags .editable
   5. setupComments       — section-level 💬 button
   6. setupQuestions      — rich-question forms
   7. setupCustomForms    — rich-custom forms (free-form FormData capture)
   8. setupSubmitBar      — bottom bar; must exist before updateStatus
   9. setupGranularComments — hover popover; piggy-backs on the rest
  10. updateStatus        — paint initial counter values
  11. CDN loaders         — highlight.js + mermaid in parallel
   ====================================================================== */

import { setupTheme }              from "./runtime/theme.js";
import { normalize }              from "./runtime/normalize.js";
import { renderDiffs }             from "./runtime/diff.js";
import { setupEditable }           from "./runtime/editable.js";
import { setupComments }           from "./runtime/comments/section.js";
import { setupGranularComments }   from "./runtime/comments/granular.js";
import { setupQuestions }          from "./runtime/forms/questions.js";
import { setupCustomForms }        from "./runtime/forms/custom.js";
import { setupSubmitBar, updateStatus } from "./runtime/submit.js";
import { maybeLoadHighlight, maybeLoadMermaid } from "./runtime/util.js";

document.addEventListener("DOMContentLoaded", async () => {
  setupTheme();
  normalize();
  renderDiffs();
  setupEditable();
  setupComments();
  setupQuestions();
  setupCustomForms();
  setupSubmitBar();
  setupGranularComments();
  updateStatus();
  await Promise.allSettled([maybeLoadHighlight(), maybeLoadMermaid()]);
});
