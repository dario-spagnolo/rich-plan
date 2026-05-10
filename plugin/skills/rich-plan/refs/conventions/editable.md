# Editable prose

The runtime makes prose elements editable in place — the user clicks, types, and the result lands in `submission.json` as an `edits[]` entry.

## Automatic for prose

Inside `.plan-header` and any `<section>`, these elements become editable automatically. **No `class="editable"` needed.**

- `<p>` paragraphs
- `<li>` list items

These elements are **NOT** made editable (deliberately):

- `<h1>`, `<h2>`, `<h3>`

These containers are **skip-zones** — their interior is left alone:

- `<pre>` / `<table>` / `.mermaid` / `.diff` / `.file-tree` / `.rich-question` / `.rich-custom`

If a `<li>` wraps a rich block (e.g. an explanatory bullet that contains a code snippet), the prose around the block stays editable but the block itself is protected via `contenteditable="false"`.

## Opt-out: `class="static"`

For a paragraph that genuinely should not be edited (a fixed disclaimer, a quoted policy line), opt out:

```html
<p class="static">This warning is not editable.</p>
```

## What lands in submission.json

For every editable element the user actually modified:

```json
{
  "id": "edit-3",
  "anchor": "step-1-jwt-module",
  "section_title": "Step 1 — JWT module",
  "diff_summary": "- \"15 min\"  + \"30 min\"",
  "before": "<old HTML>",
  "after":  "<new HTML>"
}
```

`diff_summary` is a compact text-level delta safe to skim. Read `before`/`after` only when the full markup is needed.

## Authoring tips

- Mark text the user is most likely to refine as `editable` — overuse dilutes the signal. Headings, structural labels, code blocks: leave alone.
- Don't pre-fill an editable `<p>` with a placeholder like "TBD" when the real value is known. Write the real content; the user can edit it if they want to.
- Long prose sections get edited as a whole. If the user might want to edit half a sentence, splitting that paragraph in two yields finer-grained edits and finer-grained `diff_summary` lines on read-back.
