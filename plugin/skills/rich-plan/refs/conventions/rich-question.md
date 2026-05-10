# `<form class="rich-question">` — multiple-choice decisions

Use these whenever the plan has a real decision the user must make and there are a small number of valid options. The shared radio `name` becomes the question id; the radio carrying the `checked` attribute becomes the default; a free-text "Other:" row is auto-injected.

## Minimal example

```html
<form class="rich-question">
  <div class="q-prompt">What JWT TTL should we use (seconds)?</div>
  <label><input type="radio" name="ttl" value="900"> 900 (15 min)</label>
  <label><input type="radio" name="ttl" value="3600" checked> 3600 (1 hour)</label>
  <label><input type="radio" name="ttl" value="86400"> 86400 (1 day)</label>
</form>
```

The runtime:
- Numbers each question (`Q1`, `Q2`, …) in document order with a pill at the start of `.q-prompt` — no markup needed from the author.
- Wraps each option's post-radio content into a single `<span class="q-option-text">` so inline tags (`<strong>`, `<code>`) and inter-tag text don't fragment under the label's flex layout.
- Pre-checks the `value="3600"` radio and adds a "default" pill to its label.
- Auto-injects an "Other:" row at the bottom (text input) — the user can type a free-form answer if none of the options fit.
- Resolves the question id from the shared radio `name`, so this question appears as `{ "id": "ttl", … }` in `submission.json`.
- Adds a 💬 toggle in the question's top-right corner so the user can leave a per-question comment (auto-saved). Submitted as a comment with `target_type: "question"`, `target_locator: { question_id }` — see `comments.md`.

## Rules

1. **All `<input type="radio">` inside one `<form>` must share the same `name`.** That shared `name` becomes the question id — pick something readable like `ttl`, `rollout`, `grid-size`.
2. **Mark exactly one radio per form with `checked`.** That's the default the user will submit if they don't change anything. Without a `checked`, no default gets pre-selected.
3. **The `.q-prompt` element is the question text.** Use it; don't rely on prose around the form.
4. The free-text answer arrives with `is_free_text: true` in the submission.
5. To suppress the auto-injected "Other:" row, set `data-allow-free="false"` on the `<form>`.
6. Place questions where the decision is most relevant in the plan flow, not in a single block at the bottom.
7. **Always pre-check a default that matches what would be done without input** — the user should be able to skim, submit, and get a reasonable plan.

## When to override the auto-derivation

For two questions in the same plan that semantically need the same `name` (rare — typically a smell that masks two questions when there's really one), or for a stable id independent of the radio name:

```html
<form class="rich-question" data-question-id="rollout-strategy" data-default="canary">
  <div class="q-prompt">Rollout strategy</div>
  <label><input type="radio" name="rollout" value="canary"> Canary 1%</label>
  <label><input type="radio" name="rollout" value="full"> Full rollout</label>
</form>
```

`data-question-id` and `data-default` win over the auto-derived values when present.

## When NOT to use rich-question

- For free-form ranking, sliders, multi-select, or design widgets → use **`rich-custom`** instead (see the conventions table in `SKILL.md`).
- For things existing conventions answer (style, file location, naming) — match what's already there. The user shouldn't have to re-decide local conventions every plan.

## Submission format

```json
{
  "id": "ttl",
  "prompt": "What JWT TTL should we use (seconds)?",
  "default": "3600",
  "answer": "3600",
  "is_free_text": false,
  "changed_from_default": false
}
```

`changed_from_default: true` is the signal that the user actively decided on something other than the recommended option — pay extra attention to those.
