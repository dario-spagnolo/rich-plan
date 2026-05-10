/* Free-form custom forms (<form class="rich-custom">). Anything goes
   inside — sliders, color pickers, drag-rankers driven by hidden inputs,
   matrices, custom previews. The runtime stays out of the way: it just
   serialises the form's FormData on every change and at submit time.

   Convention contract:
   - The author wraps controls in <form class="rich-custom"
     data-custom-id="…">.
   - Every control the author wants reported has a `name` attribute.
   - Multiple controls sharing the same `name` (checkboxes, multi-radio)
     are reported as an array; a single control's value is reported as a
     string. Authors who need structured state stuff a JSON string into
     <input type="hidden"> and parse it on read-back.
   - The form's native submit is suppressed; only the rich-plan submit
     bar finalises the plan.                                              */

import { state } from "../state.js";

function serialiseForm(form) {
  const data = new FormData(form);
  const out = {};
  for (const key of new Set(data.keys())) {
    const all = data.getAll(key);
    out[key] = all.length === 1 ? all[0] : all;
  }
  return out;
}

export function setupCustomForms() {
  document.querySelectorAll("form.rich-custom").forEach((form, i) => {
    const id = form.dataset.customId || `custom-${i}`;
    form.dataset.customId = id;

    state.customs.set(id, serialiseForm(form));

    /* The "X forms" counter on the submit bar is fixed (= number of
       rich-custom forms), so nothing to refresh on each change. We only
       reseed the live state so the payload is up-to-date at submit.    */
    const reseed = () => {
      state.customs.set(id, serialiseForm(form));
    };
    /* Both events are needed: `input` fires on text/range/color while the
       user is dragging or typing; `change` fires for radios, checkboxes
       and selects on commit.                                             */
    form.addEventListener("input", reseed);
    form.addEventListener("change", reseed);

    /* Authors may add a <button type="submit"> for visual completeness
       (e.g. "Apply preview"); we never let it actually submit the form
       because that would navigate away. Custom JS that needs to react to
       the button still receives the click event normally.                */
    form.addEventListener("submit", (e) => e.preventDefault());
  });
}

/* Used by submit.js right before sending: returns the first invalid
   form (or null) so the submit handler can focus it and abort.          */
export function firstInvalidCustomForm() {
  for (const form of document.querySelectorAll("form.rich-custom")) {
    if (!form.checkValidity()) return form;
  }
  return null;
}

/* Force a fresh serialise pass at submission time, in case the author's
   JS pushed a hidden-input value without dispatching an input event.    */
export function reseedAllCustomForms() {
  document.querySelectorAll("form.rich-custom").forEach((form) => {
    const id = form.dataset.customId;
    if (!id) return;
    state.customs.set(id, serialiseForm(form));
  });
}
