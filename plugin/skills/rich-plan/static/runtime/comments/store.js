/* Comment CRUD on the shared state. Single upsert path: empty text on an
   existing comment deletes it; non-empty creates or updates. Visual
   markers (selection <mark>, per-line 💬, .rp-commented tint) are kept
   in sync here so callers don't need to touch the DOM directly.         */

import { state } from "../state.js";
import {
  ensureMarkForSelection,
  removeMarkForComment,
  refreshCodeLineMarkers,
} from "./marks.js";

export function makeCommentId() {
  return "c-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function locatorEq(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function commentMatchesTarget(c, target) {
  if (!target) return false;
  if (c.anchor !== target.sectionId) return false;
  if (c.target_type !== target.type) return false;
  if (c.target_type === "section") return true;
  return locatorEq(c.target_locator, target.locator);
}

export function findCommentForTarget(target) {
  return state.comments.find((c) => commentMatchesTarget(c, target));
}

export function upsertComment(target, text) {
  const existing = findCommentForTarget(target);
  text = (text || "").trim();

  if (existing) {
    if (!text) {
      const idx = state.comments.indexOf(existing);
      if (idx >= 0) state.comments.splice(idx, 1);
      if (target.type === "selection") {
        removeMarkForComment(existing);
      } else if (target.type !== "code-line" && target.element?.classList) {
        target.element.classList.remove("rp-commented");
      }
      refreshCodeLineMarkers();
      return { action: "delete", comment: existing };
    }
    existing.text = text;
    existing.ts = new Date().toISOString();
    return { action: "update", comment: existing };
  }

  if (!text) return { action: "noop" };

  const c = {
    id: makeCommentId(),
    anchor: target.sectionId,
    target_type: target.type,
    target_text: target.text,
    target_locator: target.locator || null,
    text,
    ts: new Date().toISOString(),
  };
  state.comments.push(c);

  if (target.type === "selection") {
    ensureMarkForSelection(target, c.id);
  } else if (target.type !== "code-line" && target.element?.classList) {
    target.element.classList.add("rp-commented");
  }
  refreshCodeLineMarkers();

  return { action: "create", comment: c };
}
