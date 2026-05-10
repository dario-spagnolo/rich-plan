/* Submit bar + payload assembly + the three exit paths (approve gated /
   approve fast / reject). Also owns updateStatus() because the bar's
   counters live here and are the single source of truth for "did the
   user touch anything".                                                  */

import { state } from "./state.js";
import { firstInvalidCustomForm, reseedAllCustomForms } from "./forms/custom.js";

/* --- Submission helpers ------------------------------------------------ */

function getSectionTitle(anchor) {
  if (!anchor) return null;
  if (anchor === "(header)") {
    const h1 = document.querySelector(".plan-header h1");
    return h1 ? `${h1.textContent.trim()} (plan header)` : "(plan header)";
  }
  if (anchor === "(root)") return "(root)";
  const el = document.getElementById(anchor);
  if (!el) return null;
  return el.querySelector("h2, h3")?.textContent.trim() || null;
}

function buildPlanOutline() {
  const header = document.querySelector(".plan-header");
  const sections = [...document.querySelectorAll(".plan-section")].map((s) => ({
    id: s.id,
    title: s.querySelector("h2, h3")?.textContent.trim() || s.id,
  }));
  return {
    title: header?.querySelector("h1")?.textContent.trim() || null,
    summary: header?.querySelector(".plan-summary")?.textContent.trim() || null,
    sections,
  };
}

/* Compact textual diff between two HTML snippets — strips tags, finds
   the longest common prefix/suffix and reports only what changed.       */
function smallDiff(before, after) {
  const stripTags = (s) =>
    String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const a = stripTags(before);
  const b = stripTags(after);
  if (a === b) return "(markup-only change)";
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  ) {
    suf++;
  }
  const removed = a.slice(pre, a.length - suf);
  const added = b.slice(pre, b.length - suf);
  const parts = [];
  if (removed) parts.push("- " + JSON.stringify(removed));
  if (added) parts.push("+ " + JSON.stringify(added));
  return parts.join("  ");
}

/* --- Submit bar UI ----------------------------------------------------- */

export function setupSubmitBar() {
  if (document.querySelector(".rp-submit-bar")) return;
  const bar = document.createElement("div");
  bar.className = "rp-submit-bar";
  bar.innerHTML = `
    <div class="rp-status">
      <span class="count edits-count">0</span> edits ·
      <span class="count comments-count">0</span> comments ·
      <span class="count questions-count">0</span> answers ·
      <span class="count customs-count">0</span> forms
    </div>
    <div class="rp-actions">
      <button type="button" class="ghost" data-action="reject" title="Reject (Esc)">Reject</button>
      <button type="button" class="outline" data-action="approve-fast" title="Approve and start implementation immediately">Approve &amp; build</button>
      <button type="button" class="primary" data-action="approve" title="Approve (Enter) — Claude will restate the plan and wait for your go-ahead">✓ Approve</button>
    </div>
  `;
  document.body.appendChild(bar);

  bar.querySelector('[data-action="reject"]').addEventListener("click", rejectPlan);
  bar.querySelector('[data-action="approve-fast"]').addEventListener("click", () => approvePlan("fast"));
  bar.querySelector('[data-action="approve"]').addEventListener("click", () => approvePlan("gated"));

  /* Keyboard shortcuts: Enter = Approve (gated), Esc = Reject. Skipped
     while the user is typing in a field so they don't trigger
     accidentally.                                                       */
  document.addEventListener("keydown", (e) => {
    if (state.submitted) return;
    const t = e.target;
    if (t && t.matches('textarea, input, [contenteditable="true"]')) return;
    if (e.key === "Enter") {
      e.preventDefault();
      approvePlan("gated");
    } else if (e.key === "Escape") {
      e.preventDefault();
      rejectPlan();
    }
  });
}

export function updateStatus() {
  const bar = document.querySelector(".rp-submit-bar");
  if (!bar) return;
  const edits     = [...state.edits.values()].filter((e) => e.modified).length;
  const comments  = state.comments.length;
  const questions = state.questions.size;
  const customs   = state.customs.size;
  bar.querySelector(".edits-count").textContent = edits;
  bar.querySelector(".comments-count").textContent = comments;
  bar.querySelector(".questions-count").textContent = questions;
  bar.querySelector(".customs-count").textContent = customs;
}

/* --- Payload + endpoints ----------------------------------------------- */

function buildPayload(approvalMode) {
  const edits = [...state.edits.values()]
    .filter((e) => e.modified)
    .map((e) => ({
      id: e.id,
      anchor: e.anchor,
      section_title: getSectionTitle(e.anchor),
      diff_summary: smallDiff(e.before, e.after),
      before: e.before,
      after: e.after,
    }));

  const comments = state.comments.map((c) => ({
    id: c.id,
    anchor: c.anchor,
    section_title: getSectionTitle(c.anchor),
    target_type: c.target_type,
    target_text: c.target_text,
    target_locator: c.target_locator,
    text: c.text,
    ts: c.ts,
  }));

  const questions = [...state.questions.entries()].map(([id, v]) => ({
    id,
    prompt: v.prompt,
    default: v.default,
    answer: v.value,
    is_free_text: v.isFree,
    changed_from_default: v.isFree
      ? true
      : v.default != null && v.value !== v.default,
  }));

  const customs = [...state.customs.entries()].map(([id, v]) => ({
    id,
    values: v,
  }));

  return {
    title: document.querySelector("h1")?.textContent.trim() || "Untitled plan",
    submitted_at: new Date().toISOString(),
    approval_mode: approvalMode,
    plan_outline: buildPlanOutline(),
    edits,
    comments,
    questions,
    customs,
  };
}

async function approvePlan(mode) {
  if (state.submitted) return;

  /* Final pull of any custom-form state the author's JS may have set on
     hidden inputs without dispatching an input event. */
  reseedAllCustomForms();

  /* HTML5 validation across rich-custom forms. If anything is invalid,
     focus the first offender and bail out — submitting an incomplete
     plan would just confuse Claude on read-back.                        */
  const invalid = firstInvalidCustomForm();
  if (invalid) {
    invalid.reportValidity();
    invalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  state.submitted = true;
  const payload = buildPayload(mode);
  const fullHtml = "<!doctype html>\n<html>\n" + document.documentElement.innerHTML + "\n</html>";

  showOverlay("Sending…", "Submitting plan to Claude Code.");

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, snapshot_html: fullHtml }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const followUp = mode === "fast"
      ? "Implementation will start immediately. You can close this tab."
      : "Claude Code will restate the plan and wait for your go-ahead. You can close this tab.";
    showOverlay("Plan approved ✓", followUp);
  } catch (e) {
    state.submitted = false;
    showOverlay("Error", "Failed to submit plan: " + e.message + ". Try again.", true);
  }
}

async function rejectPlan() {
  if (state.submitted) return;
  if (!confirm("Reject this plan? Claude Code will be told you don't want to proceed.")) return;
  state.submitted = true;
  try {
    await fetch("/api/reject", { method: "POST" });
  } catch (e) { /* ignore */ }
  showOverlay("Plan rejected", "You can close this tab.");
}

function showOverlay(title, msg, allowClose = false) {
  let overlay = document.querySelector(".rp-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "rp-overlay";
    overlay.innerHTML = `<div class="rp-overlay-box"><h2></h2><p></p></div>`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector("h2").textContent = title;
  overlay.querySelector("p").textContent = msg;
  overlay.hidden = false;
  if (allowClose) {
    setTimeout(() => { overlay.hidden = true; }, 3500);
  }
}
