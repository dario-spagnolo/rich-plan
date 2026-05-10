/* Pre-processing pass: turn idiomatic plan.html into the canonical form
   the rest of the runtime expects. Idempotent — anything the author wrote
   explicitly is preserved.                                                */

import { slugify } from "./util.js";

/* Elements whose interior should never be auto-edited by the runtime.
   Includes both pure visual blocks (pre, table, mermaid…) and the two
   structured form types — questions and free-form custom forms. The
   custom form is opted out so its <p>/<h3> labels stay static; the user
   interacts with its inputs, not its prose.                              */
const SKIP_SELECTOR =
  "pre, table, .mermaid, .diff, .file-tree, .rich-question, .rich-custom";

export function normalize() {
  /* 1. Auto-class direct <section> children of <main>. */
  document.querySelectorAll("main > section").forEach((s) => {
    s.classList.add("plan-section");
  });

  /* 2. Auto-id every .plan-section from its h2/h3. Collision-safe. */
  const usedIds = new Set(
    [...document.querySelectorAll("[id]")].map((e) => e.id)
  );
  document.querySelectorAll(".plan-section").forEach((s) => {
    if (s.id) return;
    const head = s.querySelector("h2, h3");
    const base = head ? slugify(head.textContent) : "section";
    let id = base;
    let n = 2;
    while (usedIds.has(id)) { id = `${base}-${n++}`; }
    s.id = id;
    usedIds.add(id);
  });

  /* 3. Auto-mark prose elements as editable. <h1>/<h2>/<h3> are NOT made
        editable — they are anchors and renaming them would move the
        comment targets underneath the user's feet.                       */
  const targets = document.querySelectorAll(
    ".plan-header p, .plan-section p, .plan-section li"
  );
  targets.forEach((el) => {
    if (el.classList.contains("editable")) return;
    if (el.classList.contains("static")) return;
    /* Walk up to find an ancestor that is a skip-zone (pre, table,
       rich-question, rich-custom, etc.). */
    for (
      let p = el.parentElement;
      p && !p.classList.contains("plan-header") && !p.classList.contains("plan-section");
      p = p.parentElement
    ) {
      if (p.matches(SKIP_SELECTOR)) return;
    }
    el.classList.add("editable");
    /* Rich-block descendants must be marked contenteditable=false so they
       don't get accidentally edited as part of the surrounding prose.    */
    el.querySelectorAll(SKIP_SELECTOR).forEach((rich) => {
      rich.setAttribute("contenteditable", "false");
    });
  });

  /* 4. rich-question normalisation: derive id from radio name, default
        from the radio that carries the `checked` *attribute* (matches
        what the author wrote, not the live state). The author can omit
        data-question-id / data-default entirely.                         */
  document.querySelectorAll(".rich-question").forEach((q) => {
    if (!q.dataset.questionId) {
      const firstRadio = q.querySelector('input[type="radio"][name]');
      if (firstRadio && firstRadio.name) q.dataset.questionId = firstRadio.name;
    }
    if (!q.dataset.default) {
      const checked = [...q.querySelectorAll('input[type="radio"]')]
        .find((r) => r.hasAttribute("checked"));
      if (checked) q.dataset.default = checked.value;
    }
  });
}
