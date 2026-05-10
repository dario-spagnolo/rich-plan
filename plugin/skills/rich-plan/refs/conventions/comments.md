# Comments — section + element-level

Comments work at two levels and require **zero markup** from the author. The runtime instruments everything automatically.

## Section level

Every `<section>` gets a 💬 button in its top-right corner. The user can leave a general comment on the section there.

In `submission.json`:

```json
{
  "anchor": "overview",
  "section_title": "Overview",
  "target_type": "section",
  "target_text": null,
  "target_locator": null,
  "text": "Mention that short TTL implies a refresh token."
}
```

## Element level — seven target types

Hovering certain elements reveals a floating "💬 Comment" button that opens a popover anchored to the element. The user can comment precisely on:

| Target type | Triggered by | Locator fields |
|-------------|--------------|----------------|
| `selection` | drag to select text inside an editable paragraph | `{ editable_id, snippet }` |
| `code-line` | hover any `<pre><code>` line | `{ line }` (1-based) |
| `tree-line` | hover any line of a `.file-tree` | `{ path, action }` |
| `table-cell` | hover any `<td>` / `<th>` | `{ row, col }` (0-based, counting `<thead>`) |
| `mermaid` | hover a node, edge, or cluster of a Mermaid diagram | `{ id, kind }` (`kind` ∈ `"node" \| "edge" \| "cluster"`) |
| `question` | dedicated 💬 toggle on a `<form class="rich-question">` | `{ question_id }` |
| `section` | section's 💬 button | `null` |

All comments end up in `submission.json` under `comments[]`, distinguished by `target_type`. **Read every comment** — never assume comments are section-level by default. Element-level comments carry locators that often pinpoint a precise concern that would be lost in a section summary.

## Visual persistence

After a comment is saved, the runtime adds a visual marker so the user can see what they commented on:

- `selection` → `<mark>` wraps the original selected text inside the editable.
- `code-line` → small 💬 marker pinned at the right edge of the line, inside the `<pre>`.
- `tree-line`, `table-cell`, `mermaid`, `question` → `.rp-commented` tint on the element, plus a filled-in 💬 toggle on the question itself.

Clicking any of these reopens the popover (or, for questions, the inline panel) for that specific comment, so the user can edit or delete it.

## Auto-save and deletion

Comments save automatically: the textarea has no Save button. As the user types, a debounced write (~500ms) commits the comment to the in-memory store; a small "Saving…" → "Saved" indicator inside the panel reflects state. Two ways to delete an existing comment:

- Click the **Delete** button (visible inside the panel only when a comment exists).
- Erase the textarea content — auto-save then runs an empty write, which removes the comment.

## Comments inside `rich-custom` and `rich-question`

Anything inside `<form class="rich-custom">` or inside `<form class="rich-question">` is **opted out** of generic element-level commenting (no hover popover on inputs/labels). Custom blocks are self-contained UIs and questions have their own dedicated 💬 toggle — commenting on individual radios or labels would be noise. Section-level 💬 still applies to the surrounding section.

## Authoring tips

- No setup needed to enable comments — they work as soon as the elements exist.
- For a stable section id (referenced elsewhere in the plan, or to avoid an auto-derived collision), write `id="…"` explicitly on the `<section>`.
- Don't pre-write comments — leave the comment surface empty. The user fills it.
