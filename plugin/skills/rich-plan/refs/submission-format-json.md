# Submission — payload schema

## Contents
- Top-level fields
- `_instructions[]` — server-injected orchestration guidance
- `edits[]` — in-place text changes
- `comments[]` — section + element-level
- `questions[]` — `<form class="rich-question">` answers
- `customs[]` — `<form class="rich-custom">` values
- Patterns for read-back

> **Two on-disk formats.** The server writes the same payload twice: as `submission.toon` (TOON-encoded, what the `APPROVED` marker points to, ~37% smaller in tokens) and `submission.json` (debug oracle for humans). The schema described below is the single source of truth — it applies identically to both. The JSON snippets in this file mirror the structure literally; for TOON-specific syntax (tabular vs expanded arrays, quoting, escapes), see [`submission-format-toon.md`](submission-format-toon.md).

The submission contains the user's edits, their answers to questions, the values of any free-form custom forms, and any comments they left.

Comments come in two flavours:
- **Section-level** — the user clicked the 💬 in the section header.
- **Element-level** — the user hovered a specific item (a text selection, a code line, a Mermaid node/edge, a file-tree entry, or a table cell) and left a precise comment on it. **Read every comment, not just the section-level ones** — element-level comments carry locators that often matter more than the section anchor.

```json
{
  "title": "…",
  "submitted_at": "2026-05-09T15:25:00.822Z",
  "approval_mode": "gated",

  "_instructions": [
    "Once the user has given explicit go-ahead in chat, structure the implementation with TaskCreate: one task per major step from the plan. …"
  ],

  "edits": [
    {
      "id": "edit-3",
      "anchor": "step-1-jwt-module",
      "section_title": "Step 1 — JWT module",
      "diff_summary": "- \"15 min\"  + \"30 min\"",
      "before": "<old HTML of the editable element>",
      "after":  "<new HTML the user typed>"
    }
  ],

  "comments": [
    {
      "anchor": "overview",
      "section_title": "Overview",
      "target_type": "section",
      "target_text": null,
      "target_locator": null,
      "text": "Mention that short TTL implies a refresh token.",
      "ts": "2026-05-09T15:24:56.185Z"
    },
    {
      "anchor": "step-1-jwt-module",
      "target_type": "code-line",
      "target_text": "    return jwt.encode({\"sub\": user_id, \"iat\": now, \"exp\": now + ttl},",
      "target_locator": { "line": 11 },
      "text": "Why no `aud` claim?"
    },
    {
      "anchor": "step-1-jwt-module",
      "target_type": "selection",
      "target_text": "secret: str",
      "target_locator": { "editable_id": "edit-7", "snippet": "secret: str" },
      "text": "Should be `bytes` to match cryptography lib expectations."
    },
    {
      "anchor": "files",
      "target_type": "tree-line",
      "target_text": "src/auth/jwt.py",
      "target_locator": { "path": "src/auth/jwt.py" },
      "text": "Put under `src/auth/` not `src/security/`."
    },
    {
      "anchor": "step-3",
      "target_type": "mermaid",
      "target_text": "Verify JWT",
      "target_locator": { "id": "flowchart-C-2", "kind": "node" },
      "text": "Add a step: refresh tokens"
    },
    {
      "anchor": "controls",
      "target_type": "table-cell",
      "target_text": "Esc",
      "target_locator": { "row": 6, "col": 1 },
      "text": "Also accept Ctrl+C cleanly."
    }
  ],

  "questions": [
    { "id": "ttl",           "answer": "3600",        "is_free_text": false, "default": "3600",  "changed_from_default": false },
    { "id": "legacy-window", "answer": "21 days",     "is_free_text": true,  "default": null,    "changed_from_default": true  }
  ],

  "customs": [
    { "id": "button-design",
      "values": {
        "padding": "12",
        "bg": "#3aa3cc",
        "features": ["icon", "label"]
      }
    },
    { "id": "variant-ranking",
      "values": { "order": "B,A,C" }
    }
  ]
}
```

## Field reference

### Top-level

- `title` — derived from the plan's `<h1>`.
- `submitted_at` — ISO 8601 timestamp of submission.
- `approval_mode` — `"gated"` or `"fast"`. Mirrors which button the user pressed; trust it as a tie-breaker if the Monitor outcome line is ambiguous.
- `plan_outline` — `{ title, summary, sections: [{id, title}] }`. Snapshot of the plan structure for orientation.
- `_instructions` — server-injected array of strings. Orchestration guidance for the implementation phase that follows the approval gate (e.g. "structure the work with TaskCreate"). Tailored to `approval_mode`; not authored by the plan or the user. **Apply these once the gate clears** — see SKILL.md "Approval gate".

### `edits[]` — in-place text changes

- `id` — unique within the plan (`edit-N`).
- `anchor` — id of the enclosing section (or `(header)` / `(root)`).
- `section_title` — human-readable section name, resolved from the anchor.
- `diff_summary` — compact `- "old"  + "new"` summary; safe to skim before reading the full HTML.
- `before` / `after` — full HTML of the element pre/post edit.

### `comments[]`

- `anchor` — id of the enclosing `<section>` (or `(header)` / `(root)`).
- `section_title` — resolved title.
- `target_type` — one of `section`, `selection`, `code-line`, `mermaid`, `tree-line`, `table-cell`.
- `target_text` — a snippet of what was commented (the selected text, the code line, the cell content, the node label). Enough to understand the comment without reloading `submission.html`.
- `target_locator` — type-specific identifier:
  - `section`: `null`
  - `selection`: `{ editable_id, snippet }`
  - `code-line`: `{ line }` — 1-based line number within the `<pre><code>` text content
  - `mermaid`: `{ id, kind }` where `kind` is `"node" | "edge" | "cluster"`
  - `tree-line`: `{ path, action }`
  - `table-cell`: `{ row, col }` — both 0-based, counting all rows including `<thead>`
- `text` — what the user wrote.
- `ts` — ISO 8601 timestamp.

### `questions[]` — `<form class="rich-question">` answers

- `id` — the shared radio `name`.
- `prompt` — the question text (from `.q-prompt`).
- `default` — the value the author marked `checked`, or `null`.
- `answer` — the value the user submitted (their selection, or their free-text "Other:" input).
- `is_free_text` — `true` when the user typed in the "Other:" row.
- `changed_from_default` — `true` if the answer differs from the default. Triage signal: which decisions the user actively made vs let ride.

### `customs[]` — `<form class="rich-custom">` values

Each entry is one custom form's serialised state:

- `id` — `data-custom-id` on the form (auto-derived to `custom-N` if missing).
- `values` — an object keyed by control `name`. Single-valued controls map to their string value; multi-valued ones (`name="features"` on multiple checkboxes, or repeated radios) map to an **array of strings**.

Patterns to expect on read-back:
- `<input type="range">` or `<input type="number">` → string ("12", "3.14"). Cast as needed.
- `<input type="color">` → string in `#rrggbb` form.
- `<input type="checkbox">` with no `value` → string `"on"` when checked, key absent when not.
- `<input type="checkbox">` with `value="…"` → the value when checked, absent when not. Multiple checkboxes sharing a `name` → array.
- `<input type="hidden" name="state" value='{"x":1}'>` → the JSON **as a string**. Parse it on read with `JSON.parse`.

A hidden input used to capture state from custom JS (e.g. drag-rank order) lands in `values` as a serialised string. The runtime never auto-parses JSON-shaped strings; parse explicitly.
