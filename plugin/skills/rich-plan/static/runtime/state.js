/* Shared mutable state for the runtime modules.
   Each entry is populated by the corresponding setup* function and read
   by the submission builder.                                            */

export const state = {
  edits:     new Map(),   // element -> { id, before, after, anchor, modified }
  comments:  [],          // [{ id, anchor, target_type, target_text, target_locator, text, ts }]
  questions: new Map(),   // id -> { prompt, default, value, isFree }
  customs:   new Map(),   // id -> { values: object }   ← rich-custom forms
  submitted: false,
};
