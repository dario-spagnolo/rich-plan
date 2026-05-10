/* Element-level commenting. Singleton floating button + popover that
   re-positions to whatever commentable element the user hovers (code
   lines, tree lines, table cells, mermaid nodes) or selects (text inside
   editable paragraphs). Click on an already-commented element re-opens
   its popover.

   Anything inside a <form class="rich-custom"> or <form class="rich-question">
   is opted out — those forms are self-contained UIs with their own
   commenting affordances (rich-question has its own 💬 toggle). Section
   -level 💬 still works for general feedback on the surrounding section.*/

import { state } from "../state.js";
import { getLineRectViaRange, treeLineInfo } from "../util.js";
import { findCommentForTarget } from "./store.js";
import { installAutosave } from "./autosave.js";

const RIGHT_CENTER_TYPES = new Set(["code-line", "tree-line", "table-cell"]);
const BTN_W = 100;
const BTN_H = 24;

/* True if the element lives inside a form whose internals are off-limits
   to granular commenting (rich-custom, rich-question).                 */
function inOptedOutBlock(el) {
  return !!(el && el.closest && el.closest("form.rich-custom, form.rich-question"));
}

export function setupGranularComments() {
  /* --- Singleton button + popover + line overlay ----------------------- */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rp-element-btn";
  btn.innerHTML = "💬 Comment";
  document.body.appendChild(btn);

  const popover = document.createElement("div");
  popover.className = "rp-element-popover";
  popover.innerHTML = `
    <div class="rp-target-snippet"></div>
    <textarea placeholder="Comment on this element…" rows="3"></textarea>
    <div class="rp-pop-actions">
      <span class="rp-save-status" aria-live="polite"></span>
      <button type="button" data-act="delete" hidden>Delete</button>
      <button type="button" data-act="close">Close</button>
    </div>
  `;
  document.body.appendChild(popover);

  const lineOverlay = document.createElement("div");
  lineOverlay.className = "rp-line-hover-overlay";
  document.body.appendChild(lineOverlay);

  let target = null;
  let popoverOpen = false;
  let hideTimer = null;

  /* Auto-save wiring. The textarea is shared across many targets (the
     popover is a singleton), so the controller looks up `target` lazily
     each time it needs to commit. Whenever the popover is repointed or
     closed, we flush any pending save first so an orphaned debounce
     can't write a draft for target A onto target B. */
  const ta = popover.querySelector("textarea");
  const statusEl = popover.querySelector(".rp-save-status");
  const deleteBtn = popover.querySelector('[data-act="delete"]');

  function refreshDeleteButton() {
    deleteBtn.hidden = target ? !findCommentForTarget(target) : true;
  }

  const autosaveCtl = installAutosave({
    textarea: ta,
    getTarget: () => target,
    statusEl,
    onAfterSave: refreshDeleteButton,
  });

  function showButton(rect, t) {
    if (popoverOpen) return;
    target = t;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    let top, left;
    if (RIGHT_CENTER_TYPES.has(t.type)) {
      top = rect.top + window.scrollY + (rect.height - BTN_H) / 2;
      left = rect.right + window.scrollX - BTN_W;
    } else {
      top = rect.top + window.scrollY - BTN_H - 4;
      const right = Math.min(rect.right, window.innerWidth - 8);
      left = right + window.scrollX - BTN_W;
    }
    btn.style.top = Math.max(4, top) + "px";
    btn.style.left = Math.max(4, left) + "px";
    btn.classList.add("visible");

    if (t.type === "code-line") {
      lineOverlay.style.top = (rect.top + window.scrollY) + "px";
      lineOverlay.style.left = (rect.left + window.scrollX) + "px";
      lineOverlay.style.width = (rect.right - rect.left) + "px";
      lineOverlay.style.height = (rect.bottom - rect.top) + "px";
      lineOverlay.classList.add("visible");
    } else {
      lineOverlay.classList.remove("visible");
    }
  }

  function scheduleHide() {
    if (popoverOpen) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      btn.classList.remove("visible");
      lineOverlay.classList.remove("visible");
      target = null;
      hideTimer = null;
    }, 250);
  }

  btn.addEventListener("mouseenter", () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  btn.addEventListener("mouseleave", scheduleHide);

  function openPopoverForTarget(t) {
    if (!t) return;
    /* Commit any pending save on the previous target before switching,
       so autosave never writes a stale draft onto the new target.     */
    autosaveCtl.flushNow();
    target = t;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    btn.classList.remove("visible");
    popoverOpen = true;
    const rect = t.rect;
    let popTop = rect.bottom + window.scrollY + 6;
    let popLeft = rect.left + window.scrollX;
    popLeft = Math.min(popLeft, window.innerWidth - 296);
    popLeft = Math.max(8, popLeft);
    popover.style.top = popTop + "px";
    popover.style.left = popLeft + "px";
    popover.querySelector(".rp-target-snippet").textContent = t.text || "(no snippet)";
    const existing = findCommentForTarget(t);
    ta.value = existing ? existing.text : "";
    autosaveCtl.reset();
    refreshDeleteButton();
    popover.classList.add("visible");
    setTimeout(() => {
      ta.focus();
      if (existing) ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 0);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (target) openPopoverForTarget(target);
  });

  /* --- Re-open popover on click for already-commented elements --------- */
  function reconstructTargetFromElement(el) {
    if (inOptedOutBlock(el)) return null;

    const mark = el.closest?.("mark.rp-comment-mark");
    if (mark) {
      const editable = mark.closest(".editable");
      if (!editable) return null;
      const sectionContainer = editable.closest(".plan-section, .plan-header");
      const sectionId = sectionContainer?.id
        || (sectionContainer?.classList.contains("plan-header") ? "(header)" : "(root)");
      const r = mark.getBoundingClientRect();
      const snippet = mark.dataset.snippet || mark.textContent;
      return {
        type: "selection", element: editable, text: snippet,
        locator: { editable_id: editable.dataset.editableId || null, snippet },
        sectionId,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width },
      };
    }
    const lineMarker = el.closest?.(".rp-line-marker");
    if (lineMarker) {
      const pre = lineMarker.closest("pre");
      const code = pre?.querySelector("code");
      if (!code) return null;
      const lineNum = parseInt(lineMarker.dataset.line || "0", 10);
      if (!lineNum) return null;
      const lines = code.textContent.split("\n");
      const lineText = lines[lineNum - 1] || "";
      const r = getLineRectViaRange(code, lineNum - 1);
      if (!r) return null;
      const sectionId = pre.closest(".plan-section")?.id || "(root)";
      return {
        type: "code-line", element: pre, text: lineText,
        locator: { line: lineNum }, sectionId,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width },
      };
    }
    const treeText = el.closest?.(".tree-line-text.rp-commented");
    if (treeText) {
      const info = treeLineInfo(treeText);
      const sectionId = treeText.closest(".plan-section")?.id || "(root)";
      const r = treeText.getBoundingClientRect();
      return {
        type: "tree-line", element: treeText, text: info.path,
        locator: { path: info.path, action: info.action }, sectionId,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width },
      };
    }
    const cell = el.closest?.("td.rp-commented, th.rp-commented");
    if (cell) {
      const row = cell.parentElement;
      const rowIdx = [...row.parentElement.children].indexOf(row);
      const colIdx = [...row.children].indexOf(cell);
      const sectionId = cell.closest(".plan-section")?.id || "(root)";
      const r = cell.getBoundingClientRect();
      return {
        type: "table-cell", element: cell, text: cell.textContent.trim().slice(0, 200),
        locator: { row: rowIdx, col: colIdx }, sectionId,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width },
      };
    }
    const mermaid = el.closest?.(".mermaid svg .rp-commented");
    if (mermaid) {
      const kind = mermaid.classList.contains("node") ? "node"
                : mermaid.classList.contains("edgePath") ? "edge"
                : "cluster";
      const txt = mermaid.querySelector("text, .nodeLabel, .edgeLabel, foreignObject");
      const text = (txt?.textContent || mermaid.id || kind).trim().slice(0, 100);
      const sectionId = mermaid.closest(".plan-section")?.id || "(root)";
      const r = mermaid.getBoundingClientRect();
      return {
        type: "mermaid", element: mermaid, text,
        locator: { id: mermaid.id || null, kind }, sectionId,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width },
      };
    }
    return null;
  }

  function closePopover() {
    /* Flush any pending debounce so the user's last keystrokes are
       committed even if they close the popover before the timer fires. */
    autosaveCtl.flushNow();
    autosaveCtl.reset();
    popover.classList.remove("visible");
    popoverOpen = false;
    target = null;
  }

  deleteBtn.addEventListener("click", () => {
    if (!target) return;
    ta.value = "";
    autosaveCtl.saveNow();
  });
  popover.querySelector('[data-act="close"]').addEventListener("click", closePopover);

  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && e.target !== btn) {
      const reopenTarget = reconstructTargetFromElement(e.target);
      if (reopenTarget) {
        e.stopPropagation();
        e.preventDefault();
        openPopoverForTarget(reopenTarget);
        return;
      }
    }
    if (popoverOpen && !popover.contains(e.target) && e.target !== btn) {
      closePopover();
    }
  });

  /* --- File-tree lines ------------------------------------------------- */
  document.querySelectorAll(".file-tree li").forEach((li) => {
    if (inOptedOutBlock(li)) return;
    if (li.querySelector(":scope > .tree-line-text")) return;

    const wrap = document.createElement("span");
    wrap.className = "tree-line-text";
    while (li.firstChild) {
      const c = li.firstChild;
      if (c.nodeType === 1 && c.tagName === "UL") break;
      wrap.appendChild(c);
    }
    li.insertBefore(wrap, li.firstChild);

    wrap.addEventListener("mouseenter", () => {
      const rect = wrap.getBoundingClientRect();
      const info = treeLineInfo(wrap);
      const sectionId = li.closest(".plan-section")?.id || "(root)";
      showButton(rect, {
        type: "tree-line", element: wrap, text: info.path,
        locator: { path: info.path, action: info.action },
        sectionId, rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      });
    });
    wrap.addEventListener("mouseleave", scheduleHide);
  });

  /* --- Table cells ----------------------------------------------------- */
  document.querySelectorAll("table td, table th").forEach((cell) => {
    if (inOptedOutBlock(cell)) return;
    cell.addEventListener("mouseenter", () => {
      const rect = cell.getBoundingClientRect();
      const sectionId = cell.closest(".plan-section")?.id || "(root)";
      const row = cell.parentElement;
      const rowIdx = [...row.parentElement.children].indexOf(row);
      const colIdx = [...row.children].indexOf(cell);
      showButton(rect, {
        type: "table-cell", element: cell, text: cell.textContent.trim().slice(0, 200),
        locator: { row: rowIdx, col: colIdx },
        sectionId,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      });
    });
    cell.addEventListener("mouseleave", scheduleHide);
  });

  /* --- Code lines ------------------------------------------------------ */
  function lineHeightPxFallback(el) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 14;
    const lhStr = cs.lineHeight;
    if (lhStr === "normal") return fs * 1.2;
    const num = parseFloat(lhStr);
    if (isNaN(num)) return fs * 1.2;
    return /px$/.test(lhStr) ? num : num * fs;
  }

  document.querySelectorAll("pre").forEach((pre) => {
    if (inOptedOutBlock(pre)) return;
    const code = pre.querySelector("code");
    if (!code) return;

    pre.addEventListener("mousemove", (e) => {
      if (popoverOpen) return;
      const codeRect = code.getBoundingClientRect();
      if (e.clientY < codeRect.top || e.clientY > codeRect.bottom) return;

      const lh = lineHeightPxFallback(code);
      if (lh < 6) return;
      const lines = code.textContent.split("\n");
      const hint = Math.floor((e.clientY - codeRect.top) / lh);

      let lineIdx = -1, lineRangeRect = null;
      for (const idx of [hint, hint + 1, hint - 1, hint + 2, hint - 2]) {
        if (idx < 0 || idx >= lines.length) continue;
        if (!lines[idx].trim()) continue;
        const r = getLineRectViaRange(code, idx);
        if (!r) continue;
        if (e.clientY >= r.top - 1 && e.clientY <= r.bottom + 1) {
          lineIdx = idx;
          lineRangeRect = r;
          break;
        }
      }
      if (lineIdx < 0 || !lineRangeRect) return;

      const lineRect = {
        top: lineRangeRect.top,
        bottom: lineRangeRect.bottom,
        left: codeRect.left,
        right: codeRect.right,
        height: lineRangeRect.height,
        width: codeRect.right - codeRect.left,
      };
      const sectionId = pre.closest(".plan-section")?.id || "(root)";
      showButton(lineRect, {
        type: "code-line", element: pre, text: lines[lineIdx],
        locator: { line: lineIdx + 1 },
        sectionId, rect: lineRect,
      });
    });
    pre.addEventListener("mouseleave", scheduleHide);
  });

  /* --- Text selection inside editable paragraphs ----------------------- */
  document.addEventListener("selectionchange", () => {
    if (popoverOpen) return;
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (target?.type === "selection") scheduleHide();
      return;
    }
    const range = sel.getRangeAt(0);
    const startEl = range.startContainer.nodeType === 3
      ? range.startContainer.parentElement
      : range.startContainer;
    const editable = startEl?.closest?.(".editable");
    if (!editable || inOptedOutBlock(editable)) {
      if (target?.type === "selection") scheduleHide();
      return;
    }
    const text = sel.toString().trim();
    if (!text) return;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const sectionContainer = editable.closest(".plan-section, .plan-header");
    const sectionId = sectionContainer?.id
      || (sectionContainer?.classList.contains("plan-header") ? "(header)" : "(root)");
    showButton(rect, {
      type: "selection", element: editable, text,
      locator: { editable_id: editable.dataset.editableId || null, snippet: text },
      range: range.cloneRange(),
      sectionId,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    });
  });

  /* --- Mermaid nodes/edges/clusters ------------------------------------ */
  async function attachMermaidHover() {
    for (let i = 0; i < 30; i++) {
      if (document.querySelector(".mermaid svg")) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    document.querySelectorAll(
      ".mermaid svg .node, .mermaid svg .edgePath, .mermaid svg .cluster"
    ).forEach((g) => {
      if (inOptedOutBlock(g)) return;
      g.style.cursor = "pointer";
      const kind = g.classList.contains("node") ? "node"
                : g.classList.contains("edgePath") ? "edge"
                : "cluster";
      g.addEventListener("mouseenter", () => {
        const rect = g.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const txt = g.querySelector("text, .nodeLabel, .edgeLabel, foreignObject");
        const text = (txt?.textContent || g.id || kind).trim().slice(0, 100);
        const sectionId = g.closest(".plan-section")?.id || "(root)";
        showButton(rect, {
          type: "mermaid", element: g, text,
          locator: { id: g.id || null, kind },
          sectionId,
          rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        });
      });
      g.addEventListener("mouseleave", scheduleHide);
    });
  }
  attachMermaidHover();
}
