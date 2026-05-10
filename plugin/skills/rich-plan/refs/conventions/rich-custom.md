# `<form class="rich-custom">` — free-form custom widgets

## Contents
- Boilerplate
- Conventions (Required, Multi-valued names, Ranking, Structured state, Cascading)
- Validation
- Constraints
- Authoring tips
- When to use rich-custom vs rich-question

Use this whenever a decision doesn't fit into multiple-choice (`rich-question`) but would benefit from a richer interactive surface than prose. Common cases:

- **Designing a frontend element interactively** (sliders, color pickers, live preview).
- **Ranking proposals** (drag-and-drop reorder, scored list).
- **Choosing variants and sub-variants** with a visual aid.
- **Configuring a multi-dimensional setting** (a matrix of toggles, a scatter of weights).

The contract is minimal and standard-HTML:

> The runtime walks the form's `FormData` at every change and at submit time. Any input with a `name` attribute is reported in `submission.json`. The author has full freedom over markup, styling, and JavaScript inside the form.

Any HTML5 + JS pattern works.

## Boilerplate

```html
<form class="rich-custom" data-custom-id="button-design">
  <h3>Designer le bouton</h3>
  <p>Adjust the inputs below to preview the button styling.</p>

  <label>Padding (px) <input type="range" name="padding" min="0" max="40" value="12"></label>
  <label>Background <input type="color" name="bg" value="#3aa3cc"></label>
  <label>Label text <input type="text" name="label" value="Click me" required></label>

  <div class="preview">
    <button id="preview" type="button">Click me</button>
  </div>

  <script>
    (() => {
      const f = document.currentScript.closest("form");
      const preview = f.querySelector("#preview");
      function update() {
        preview.style.padding = f.elements.padding.value + "px";
        preview.style.background = f.elements.bg.value;
        preview.textContent = f.elements.label.value;
      }
      f.addEventListener("input", update);
      update();
    })();
  </script>
</form>
```

What lands in `submission.json`:

```json
{
  "id": "button-design",
  "values": { "padding": "12", "bg": "#3aa3cc", "label": "Click me" }
}
```

## Conventions

### Required

- The form must have `class="rich-custom"`.
- The form should have `data-custom-id="…"`. If missing, the runtime auto-generates `custom-N` based on document order — fragile across reorderings, so set the id explicitly.
- Every input whose value matters needs a `name` attribute. Inputs without `name` are invisible to FormData and don't appear in the submission.

### Multi-valued names

Multiple checkboxes (or radios) sharing a `name` come back as an **array**:

```html
<form class="rich-custom" data-custom-id="features">
  <label><input type="checkbox" name="features" value="icon" checked> Icon</label>
  <label><input type="checkbox" name="features" value="label" checked> Label</label>
  <label><input type="checkbox" name="features" value="badge"> Badge</label>
</form>
```

```json
{ "id": "features", "values": { "features": ["icon", "label"] } }
```

A single value with that name comes back as a string. **Don't rely on the array shape if only one option is checked.**

### Ranking — hidden input + custom JS

There is no native HTML control for "drag to reorder". Convention: the form holds an `<input type="hidden">` whose value is the current order, and JS rewrites it whenever the user drags:

```html
<form class="rich-custom" data-custom-id="variant-ranking">
  <h3>Rank these variants</h3>
  <ul id="rank-list">
    <li draggable="true" data-key="A">Variant A — minimal change</li>
    <li draggable="true" data-key="B">Variant B — clean architecture</li>
    <li draggable="true" data-key="C">Variant C — performance-tuned</li>
  </ul>
  <input type="hidden" name="order" value="A,B,C">

  <script>
    (() => {
      const f = document.currentScript.closest("form");
      const list = f.querySelector("#rank-list");
      const orderInput = f.elements.order;

      function reseed() {
        orderInput.value = [...list.children].map(li => li.dataset.key).join(",");
        f.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // ... drag-and-drop reordering wires here, then calls reseed() after each drop ...
    })();
  </script>
</form>
```

After the user drags, `submission.json` contains `{ "values": { "order": "B,A,C" } }`. Split on `,` to read it back.

> **Important.** When JS sets a hidden input value programmatically, dispatch an `input` event on the form: `f.dispatchEvent(new Event("input", { bubbles: true }))`. Live state stays current; the runtime also re-syncs at submit.

### Structured state — hidden input + JSON

When the state is too rich for flat scalar fields (graph edges, nested config, matrices), serialise it into a JSON string in a hidden input:

```html
<input type="hidden" name="state" value='{"width":120,"height":40,"corners":"rounded"}'>
```

The runtime reports it as a **string**:

```json
{ "values": { "state": "{\"width\":120,\"height\":40,\"corners\":\"rounded\"}" } }
```

Parse with `JSON.parse(values.state)` on read-back. The runtime never auto-detects JSON.

### Cascading variants

Two `<select>` (or two radio groups) with different `name`s — the second is updated by JS as the first changes. FormData reports both independently:

```html
<form class="rich-custom" data-custom-id="variant">
  <select name="variant">
    <option value="A">A</option>
    <option value="B">B</option>
  </select>
  <select name="subvariant">
    <option value="A.1">A.1</option>
    <option value="A.2">A.2</option>
  </select>
</form>
```

```json
{ "id": "variant", "values": { "variant": "A", "subvariant": "A.2" } }
```

## Validation

HTML5 validation (`required`, `min`, `max`, `pattern`) is honoured at submit time. If any rich-custom form is invalid, the runtime focuses the first offending input, scrolls it into view, and refuses to submit the plan.

This means:
- Use `required` on inputs whose absence would confuse the agent on read-back.
- **Defaults must be valid.** A form whose default state is invalid blocks the user from submitting until it's fixed — friction.

## Constraints

- The runtime **opts out the form from auto-editable prose** — `<p>` and `<li>` inside the form stay static. The user interacts with the form's inputs, not its labels.
- The runtime **opts out the form from element-level commenting** (no hover-to-comment on individual inputs). Use the section-level 💬 for a comment on the widget as a whole.
- The form's native submit is suppressed (`preventDefault` is always called). Only the rich-plan submit bar finalises the plan.
- Multiple rich-custom forms in one plan are fine — give each a distinct `data-custom-id`.

## Authoring tips

- **Scope CSS** to `[data-custom-id="my-id"] …` (or a unique class inside) so it doesn't bleed into the rest of the plan.
- **Wrap JS in an IIFE** so variables don't pollute window globals — multiple custom forms with name collisions would otherwise stomp on each other.
- **Set sensible defaults** so the user can submit without touching the widget. Same principle as `rich-question`.
- **Don't go overboard.** A single radio choice → use `rich-question`. `rich-custom` shines when the interaction itself is the point.

## When to use rich-custom vs rich-question

| Use case | Convention |
|----------|-----------|
| One decision among 2-5 valid options | `rich-question` |
| Free-text answer with optional suggestions | `rich-question` (auto "Other:" row covers this) |
| Rank, score, or reorder a list | `rich-custom` |
| Configure several values at once (sliders, colors, sizes) | `rich-custom` |
| Live preview of a design | `rich-custom` |
| Multi-select among many options | `rich-custom` (checkboxes with shared name) |
| Cascading dependent choices | `rich-custom` |
