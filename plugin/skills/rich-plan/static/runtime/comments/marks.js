/* Visual markers that persist after a comment is saved:

   - <mark.rp-comment-mark> wraps the commented text inside an editable
     paragraph.
   - .rp-line-marker is a small 💬 glyph placed at the right edge of any
     code line that has at least one comment.
   - Other commented elements (tree-line, table-cell, mermaid node) are
     marked via the .rp-commented class — that's pure CSS, no JS.        */

import { state } from "../state.js";
import { getLineRectViaRange } from "../util.js";

/* --- Selection marks --------------------------------------------------- */

export function findExistingMarkForLocator(loc) {
  if (!loc || !loc.editable_id) return null;
  const editable = document.querySelector(
    `[data-editable-id="${CSS.escape(loc.editable_id)}"]`
  );
  if (!editable) return null;
  return [...editable.querySelectorAll("mark.rp-comment-mark")].find(
    (m) => m.dataset.snippet === loc.snippet
  ) || null;
}

export function ensureMarkForSelection(target, commentId) {
  if (target.type !== "selection") return null;
  const existing = findExistingMarkForLocator(target.locator);
  if (existing) {
    existing.dataset.commentId = commentId;
    return existing;
  }
  if (!target.range) return null;
  try {
    const mark = document.createElement("mark");
    mark.className = "rp-comment-mark";
    mark.dataset.commentId = commentId;
    mark.dataset.snippet = target.locator?.snippet || "";
    const contents = target.range.extractContents();
    mark.appendChild(contents);
    target.range.insertNode(mark);
    return mark;
  } catch (e) {
    console.warn("rich-plan: could not wrap selection range:", e);
    return null;
  }
}

export function removeMarkForComment(c) {
  if (c.target_type !== "selection") return;
  document.querySelectorAll("mark.rp-comment-mark").forEach((m) => {
    if (m.dataset.commentId !== c.id) return;
    const parent = m.parentNode;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    if (parent && typeof parent.normalize === "function") parent.normalize();
  });
}

/* --- Per-line markers in <pre> ----------------------------------------- */

/* Re-render every code-line marker from scratch. Cheap because we
   reuse .rp-line-marker spans only inside <pre>s that have comments.    */
export function refreshCodeLineMarkers() {
  document.querySelectorAll("pre").forEach((pre) => {
    pre.querySelectorAll(":scope > .rp-line-marker").forEach((m) => m.remove());
    const code = pre.querySelector("code");
    if (!code) return;
    const sectionId = pre.closest(".plan-section")?.id;
    if (!sectionId) return;

    const lineComments = state.comments.filter(
      (c) => c.anchor === sectionId && c.target_type === "code-line"
    );
    if (!lineComments.length) return;

    const preRect = pre.getBoundingClientRect();
    /* Group by line so multi-comment lines render as a single marker
       with an aggregated tooltip. */
    const byLine = new Map();
    for (const c of lineComments) {
      const ln = c.target_locator?.line;
      if (!ln) continue;
      if (!byLine.has(ln)) byLine.set(ln, []);
      byLine.get(ln).push(c);
    }

    for (const [lineNum, cs] of byLine) {
      const r = getLineRectViaRange(code, lineNum - 1);
      if (!r) continue;
      const marker = document.createElement("span");
      marker.className = "rp-line-marker";
      marker.style.top = (r.top - preRect.top + (r.height - 14) / 2) + "px";
      marker.dataset.line = String(lineNum);
      marker.title = cs.length === 1
        ? cs[0].text
        : `${cs.length} comments\n` + cs.map((c) => "• " + c.text).join("\n");
      pre.appendChild(marker);
    }
  });
}
