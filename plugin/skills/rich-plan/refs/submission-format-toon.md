# submission.toon — TOON syntax for the submission

The submission is encoded in [TOON](https://github.com/toon-format/toon) (Token-Oriented Object Notation). The schema is identical to the JSON form — see `submission-format-json.md` for field semantics. This file documents only the syntax you'll meet when reading `submission.toon`.

## Why TOON

JSON wraps every value in quotes, every key in quotes, and repeats keys for every row of an array. TOON drops the noise:
- Unquoted keys and bare strings where unambiguous.
- Tabular arrays: the keys are declared once in a header, then rows are CSV-style.
- Indentation marks structure (2 spaces per level).

On a typical rich-plan submission this saves ~37% bytes/tokens vs JSON. The same payload is also written as `submission.json` next to it for debug — fall back to it if anything in the TOON looks ambiguous.

## Top-level shape

```toon
title: My Plan
submitted_at: "2026-05-09T15:25:00.822Z"
approval_mode: gated
plan_outline:
  title: My Plan
  summary: A one-paragraph summary.
  sections[3]{id,title}:
    overview,Overview
    step-1,Step 1 — JWT
    step-2,Step 2
edits[N]{...}:
  ...rows...
comments[N]:
  - ...item...
questions[N]{id,prompt,default,answer,is_free_text,changed_from_default}:
  ...rows...
customs[N]:
  - ...item...
```

## Reading the syntax

### Scalars

- **Bare strings** (no quotes): `gated`, `Step 1 — JWT`, `<li>old</li>`. Quotes only appear when the value would be ambiguous.
- **Quoted strings** (`"..."`): the value contains a delimiter (`,`), a colon (`:`), brackets (`[ ] { }`), backslash, double-quote, or control characters; or it looks like a number / `true` / `false` / `null`; or it has leading/trailing whitespace; or it starts with `-`. Inside quotes, only five escapes are valid: `\\`, `\"`, `\n`, `\r`, `\t`.
- `null` is the literal `null` (not `"null"`).
- Booleans: lowercase `true` / `false`.
- Numbers: canonical decimal, no exponent, no trailing zeros.

### Objects

```toon
key: value
nested:
  inner: x
  empty:
```

A key with no value (bare `key:`) means an empty object or a header for nested content on the next line.

### Tabular arrays — `key[N]{cols}:`

Used when the array contains uniform objects whose values are all primitive (strings, numbers, booleans, null). One row per item, comma-separated, in column order:

```toon
questions[3]{id,prompt,default,answer,is_free_text,changed_from_default}:
  ttl,TTL?,"3600","3600",false,false
  legacy-window,"Legacy window?",,21 days,true,true
  rollout,Rollout?,canary,blue-green,false,true
```

Reading rule: split each row by `,` while respecting double-quoted cells. An empty cell between two commas (`,,`) is `null`.

In our schema, tabular form is used for: `plan_outline.sections[]`, `edits[]`, `questions[]`.

### Expanded arrays — `key[N]:`

Used when items aren't uniform-and-flat (typically because some field is itself an object). Each item starts with `- ` at depth+1; subsequent fields of the same item align with where the first key after `- ` started:

```toon
comments[2]:
  - anchor: step-1
    section_title: Step 1 — JWT
    target_type: code-line
    target_text: "    return jwt.encode(payload, secret)"
    target_locator:
      line: 11
    text: Why no `aud` claim?
    ts: "2026-05-09T15:24:56.185Z"
  - anchor: step-2
    target_type: section
    target_text: null
    target_locator: null
    text: Mention rotation strategy.
    ts: "2026-05-09T15:25:01.000Z"
```

In our schema, expanded form is used for: `comments[]` (because `target_locator` shape varies) and `customs[]` (because `values` is a free-form object).

### Empty arrays

```toon
edits[0]:
comments[0]:
```

The `[0]:` is the whole entry — no rows follow.

### Inline primitive arrays

If an array contains only primitives (rare in our schema), TOON inlines them:

```toon
tags[3]: admin,ops,dev
```

## Field-by-field mapping

The semantic field reference lives in [`submission-format-json.md`](submission-format-json.md). Below is the TOON shape only.

| Field | TOON form |
|-------|-----------|
| `title`, `submitted_at`, `approval_mode` | top-level scalars |
| `plan_outline` | nested object |
| `plan_outline.sections[]` | **tabular** `[N]{id,title}:` |
| `_instructions[]` | inline primitive array (`[N]: a,b,c`) when scalars; else expanded |
| `edits[]` | **tabular** `[N]{id,anchor,section_title,diff_summary,before,after}:` — `before` and `after` will be quoted (HTML, newlines escaped as `\n`) |
| `comments[]` | **expanded** `[N]:` — each item with `- anchor: ...` then continuation fields |
| `comments[].target_locator` | nested object inside the expanded item, or `null` for `target_type: section` |
| `questions[]` | **tabular** `[N]{id,prompt,default,answer,is_free_text,changed_from_default}:` |
| `customs[]` | **expanded** `[N]:` — `- id: ...` + nested `values:` object |
| `customs[].values` | nested object; multi-valued names land as inline primitive arrays (`features[2]: icon,label`) |

## Read-back patterns

- `<input type="range">` / `<input type="number">` → quoted string in TOON (because numeric-looking strings must be quoted to disambiguate). Cast with `int()` / `float()`.
- `<input type="color">` → bare or quoted string in `#rrggbb` form.
- `<input type="checkbox">` (no `value`) → `on` (bare).
- A hidden input carrying JSON state → the JSON document appears as one quoted string with `\"` and `\n` escapes; un-escape and `JSON.parse` (or `json.loads`) it.
- An empty cell in a tabular row (`,,`) decodes to `null`. A literal empty string is `""`.

## Sanity checks while parsing

- The `[N]` count after each array name is authoritative — if the number of rows you read doesn't match, something was truncated. Cross-check before acting on partial data.
- The `{cols}` header lists the columns in order — the first row is data, not headers.
- Quoted cells may contain commas; a naive `split(",")` will break those. Use a CSV-style splitter that respects double-quote balancing.
- If anything looks off, open `submission.json` in the same directory — same payload, easier to skim.
