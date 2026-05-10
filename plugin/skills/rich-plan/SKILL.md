---
name: rich-plan
version: 0.4.0
description: "Render a plan as a self-contained HTML page the user reviews in their browser at their own pace — rendered diffs, file trees, Mermaid diagrams, editable prose. Use when async deliberation beats real-time chat: bigger refactors, design choices, anything that deserves a coffee. Returns user edits, anchored comments, and structured decisions."
when_to_use: "When the user asks to plan a non-trivial change. Common phrasings — 'plan this', 'draft a plan for X', 'make me an implementation plan', 'plan it with options', 'I want to decide before coding'. Especially valuable when the plan involves rendered code/diffs/diagrams or explicit design decisions. Skip for one-line bug fixes or purely conversational planning where a simple chat suffices."
user-invocable: true
argument-hint: "<task description, or empty to plan from current context>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Monitor
---

# rich-plan: interactive HTML plans

Generate a single self-contained `plan.html` file that conforms to the conventions documented below. A bundled Python server renders it in the user's browser, captures their edits / comments / answers, and returns a structured submission to read before proceeding (TOON-encoded for the agent at `submission.toon`, with the same data also written as `submission.json` for human debugging).

**Never modify** `server.py`, `static/base.css`, or anything under `static/runtime/`. They are stable infrastructure. Author **only** `plan.html`. If a feature seems to require a runtime patch, the convention is probably already documented — check the references first.

## Methodology — research before drafting

A rich plan is only useful if it reflects the codebase as it actually is. Treat plan generation as a five-phase exercise — Understand → Explore → Design → Synthesize → Compose. Run all five even when the task feels familiar; recall is unreliable, verify against the code.

### Phase 1 — Understand the request

- Read the user's instruction twice. The literal ask often hides the real change. ("Add a setting" may really mean "stop hardcoding X", with broader impact than the wording suggests.)
- Restate the goal in a single sentence before exploring. If the goal can't be stated in one sentence, the requirement is ambiguous — pause and clarify with the user before producing a plan.
- **Reuse over invention.** Before designing anything, look hard for existing functions, utilities, or patterns that already do the job. A plan that introduces a brand-new helper when an equivalent lives two files away is a smell. New code is the exception that needs justification.

### Phase 2 — Explore in parallel

For anything beyond a one-line change, delegate codebase exploration to **Explore subagents** rather than running searches in the main context. Subagents preserve working memory for the actual planning work.

- One agent suffices when the task touches a known file or a small, isolated area.
- Fan out to two or three agents **IN PARALLEL** when scope crosses module boundaries, when feature wiring is unclear, or when patterns from different parts of the repo need to be compared.
- Give each agent a distinct angle. Examples of useful splits: one mapping current implementations of the relevant concept, one surveying tests and fixtures, one hunting for reusable utilities elsewhere in the repo.

### Phase 3 — Multi-perspective design

Trigger: launch the trio when you can name two concrete approaches you wouldn't want to pick between alone. Skip when one approach is clearly correct.

When triggered, fan out 2-3 `rich-plan-designer` subagents in parallel, each defending a single explicit bias drawn from `refs/bias-recipes.md`. The trio gives the orchestrator three biased takes to synthesize from — not three plans to hand the user.

Recipe per task type — see `refs/bias-recipes.md` for the full statements:

- **New feature**: simplicity-first / robustness-first / performance-first
- **Bug fix**: surgical-fix / root-cause / prevention-upstream
- **Refactor**: minimal-touch / clean-architecture / staged-incremental

Build each agent's prompt by reusing the template at `refs/designer-brief.md`. Only the bias section changes between the 2-3 prompts — code map, request, and constraints stay identical so divergence is attributable to bias alone.

Launch via `Agent` with `subagent_type: rich-plan-designer`.

### Phase 4 — Synthesize designs

Once the three reports come back, **pick the best design overall** or compose a hybrid by cherry-picking the strongest elements. The output is one recommended path you stand behind.

Synthesis rules:

- `## Files touched` — diff across designs for the file-tree consensus; resolve scope divergences yourself in favor of the picked design.
- `## Decisions made under uncertainty` — for each decision, choose the option the recommended path takes. Fold most into the plan silently. Surface only the few where the user genuinely needs to weigh in (compatibility, perf budget, scope) as a `rich-question` form, pre-checked with your best judgment.
- `## Approach` and `## Verification` — narrative material; pick what fits, drop redundancies.

Each surfaced question is a tradeoff confirmation, not a choice the user has to make from scratch.

Before moving to composition, verify assumptions. For each non-trivial claim in the plan, confirm against the code, not memory:

- "X is currently done by Y" → grep, read, confirm.
- "Adding Z won't break A" → open A, check.
- "There's no test for this" → list `tests/` before claiming so.

If verification reveals the plan is wrong, change the plan — never paper over a mismatch with hand-wavy prose.

### Phase 5 — Compose plan.html

The `plan.html` must contain, in order:

1. A **Context** section explaining *why* the change is being made: the problem it addresses, what triggered it, the desired outcome.
2. The **recommended approach**, expressed as concretely as the medium allows: real file paths, real code snippets, real diffs. Pseudocode that wouldn't compile is a tell that the design wasn't actually verified.
3. A **file-tree** of impacted files with `CREATE` / `EDIT` / `DELETE` action badges, so the user sees the blast radius at a glance.
4. **Pointers to existing utilities** that the implementation will reuse, with their file paths. This makes the "I checked before adding new code" claim auditable.
5. A **Verification** section at the end, explaining how to test the change end-to-end: which command to run, which test to invoke, which observable behavior to check in the running app. A plan with no verification is a plan whose landing can't be confirmed.

## Workflow

> `server.py` and everything under `static/` are bundled black-box artefacts. Invoke `server.py` via the Monitor command below; never read it into context "to understand it" — its interface (the two-line stdout protocol + exit codes) is documented here, and that is the only contract.

1. Choose a plan id (kebab-case, short). Create `.rich-plans/<id>/` in the user's project root.
2. Write `.rich-plans/<id>/plan.html` following the page structure and conventions below.
3. **Before launching, run through the sanity checks** (next section).
4. Launch the server via the **Monitor** tool (stays responsive while the user edits in their browser):
   - `command`: `python3 ${CLAUDE_SKILL_DIR}/server.py .rich-plans/<id>/`
   - `timeout_ms`: `3600000` (matches the server's 1h timeout)
   - `description`: e.g. `rich-plan <id> events`

   The server emits exactly two clean lines on stdout (each one becomes a Monitor event). All other logs go to stderr.

5. **First event — `URL http://127.0.0.1:PORT/`** is emitted at startup. The browser auto-opens via `xdg-open`. If the environment is headless, relay the URL to the user. Otherwise stay quiet — they're interacting with the page.

6. **Second event** — one of four outcomes:
   - `APPROVED <path-to-submission.toon>` — user clicked **Approve**. Read the file, then **run the Approval gate** (see below).
   - `APPROVED_FAST <path-to-submission.toon>` — user clicked **Approve & build**. Read the file and **start implementing immediately**. Do not restate the plan; the user explicitly opted out of the gate.
   - `REJECTED` — user clicked **Reject**. Do not implement. Acknowledge and ask what direction they want.
   - `TIMEOUT` — 60 min elapsed. Treat as `REJECTED`.

   The marker points to `submission.toon` (TOON-encoded). `submission.json` mirrors it if the TOON looks ambiguous. `submission.html` is the DOM snapshot.

## Sanity-check before launching

Re-read `plan.html` once before running the server. The runtime is forgiving but not magic — these are the half-dozen ways a plan silently misbehaves and how to spot each before wasting the user's attention.

- **Editable / static prose.** A `<p>` containing a code excerpt or generated artefact written as prose — the runtime will make it editable, which probably isn't the intent. Wrap it in a structural element (`<pre>`, `<div class="diff">`, etc.) so the runtime skips it. Conversely, a paragraph the user genuinely should not edit (a fixed disclaimer): mark it `<p class="static">`.
- **Section ids and collisions.** A `<section>` whose `<h2>` is reused verbatim elsewhere — auto-derived ids collide and the runtime appends `-2`, `-3`. For stable cross-section references, write `id="…"` explicitly on the `<section>`.
- **rich-question.** Two questions sharing the same radio `name` — the auto-derived question id collides. Use distinct `name`s, or fall back to explicit `data-question-id`. **Always mark exactly one radio per form as `checked`** — without it, no default gets pre-selected.
- **rich-custom.** An input with no `name` attribute drops out of the submission silently. Two custom forms sharing a `data-custom-id` — only the last one wins. HTML5 validation (`required` / `min` / `max` / `pattern`) is honoured at submit time, so **defaults must be valid** or the user can't submit.
- **Diffs.** Diff blocks containing literal `<` or `>` not HTML-escaped get misparsed by the browser. Escape angle brackets that appear in the diff content itself.
- **Question vs default.** Use `rich-question` for **real decisions with multiple valid options** (which TTL, which rollout strategy). Pre-check the recommended option so a user who skim-reads and submits without changes still gets a reasonable plan. Don't turn into questions things existing conventions answer (style, file location, naming).

## Page structure

Write idiomatic HTML5. The server wraps a body-only fragment in the standard shell (doctype, head, link to CSS, runtime module); start `plan.html` with `<main>` and let the server handle the rest:

```html
<main>

<header class="plan-header">
  <h1>{{ title }}</h1>
  <p class="plan-summary">{{ one-paragraph summary }}</p>
  <div class="plan-meta">
    <span>{{ optional badges, e.g. "📁 4 files" "⏱ ~3h" }}</span>
  </div>
</header>

<section>
  <h2>{{ section title }}</h2>
  ...content...
</section>

</main>
```

Every `<section>` directly inside `<main>` becomes a plan section automatically. The id is derived from the `<h2>` text (slugified) — write `id="…"` explicitly to lock it.

### Editable / static — what the runtime touches

Inside `.plan-header` and any `<section>`, these elements are **made editable automatically** : `<p>`, `<li>`. Headings (`<h1>` / `<h2>` / `<h3>`) stay locked.

These containers are **skip-zones** — their interior is never made editable: `<pre>`, `<table>`, `.mermaid`, `.diff`, `.file-tree`, `.rich-question`, `.rich-custom`. To opt a single paragraph out, use `<p class="static">`.

### Class taxonomy

Use these classes to mark up rich content. Full markup, attributes, and submission shape live in the conventions references — the table below is the index.

| Class | Element | Role |
|-------|---------|------|
| `.plan-header` | `<header>` inside `<main>` | Title block: `<h1>`, `.plan-summary`, `.plan-meta`. |
| `.plan-summary` | `<p>` inside `.plan-header` | One-paragraph summary (auto-editable). |
| `.static` | any `<p>` | Opt out of auto-edit. |
| `.diff` (`data-file="…"`) | `<div>` | Unified-diff block, parsed and colored. |
| `.file-tree` | `<div>` | File tree container. Children: nested `<ul>` with `.dir` / `.file` on each `<li>`. |
| `.action.create` / `.action.edit` / `.action.delete` | `<span>` inside a tree `<li>` | CREATE / EDIT / DELETE intent badge. |
| `.mermaid` | `<div>` | Mermaid diagram source. |
| `.rich-question` | `<form>` | Multiple-choice decision (radios share a `name`; pre-check one). |
| `.rich-custom` (`data-custom-id="…"`) | `<form>` | Free-form interactive widget (any HTML/JS inside). |
| `.q-prompt` | `<div>` inside `.rich-question` | The question text. |
| `.rp-pill` + `.success` / `.warn` / `.danger` | `<span>` | Inline status badge. |

## Conventions — pick what the plan needs

Each convention has its own reference file. **Load only the ones actually used.**

| Convention | When to use | Reference contents |
|------------|-------------|--------------------|
| Editable prose | Any plan with text the user might refine | `refs/conventions/editable.md` — exact list of auto-editable elements, the skip-zone container list, opt-out via `class="static"`, what a single edit looks like in the submission. Open if unsure whether a prose block will become editable, or to fine-tune which paragraphs the user can change. |
| Comments (section + per-element) | Always — auto-instrumented | `refs/conventions/comments.md` — six element-level target types (selection, code-line, tree-line, table-cell, mermaid, section), the locator fields each carries, visual-persistence behavior after submit, opt-outs inside `rich-custom`. Open when designing complex elements you want commentable, or to understand a locator on read-back. |
| `<form class="rich-question">` | Real decisions with multiple valid options | `refs/conventions/rich-question.md` — full markup, `data-question-id` / `data-default` overrides, auto-injected "Other:" row, suppressing free-text via `data-allow-free="false"`, submission shape (`changed_from_default` triage signal). Open when authoring a question. |
| `<form class="rich-custom">` | Anything beyond MCQ: rankings, design widgets, multi-variant pickers, custom interactive previews | `refs/conventions/rich-custom.md` — boilerplate, multi-valued names → arrays, ranking via hidden input + drag JS, JSON-state hidden input, cascading variants, validation rules, scoping CSS/JS to avoid collisions, full constraints list. Open whenever building any non-trivial interactive form. |
| Code, diffs, file-trees, mermaid, pills | Visual rich content | `refs/conventions/rich-blocks.md` — exact markup for each block: `<pre><code class="language-…">` (highlight.js languages), unified-diff parsing rules, file-tree nesting and action badges, Mermaid quirks, pill flavours, table cell commenting. Open when adding a new visual element. |
| Theming | Custom `<style>` blocks | `refs/conventions/theming.md` — the `--rp-*` CSS custom properties to use instead of hard-coded colors, `rp:theme-change` event for re-theming third-party widgets, how to pin a single theme or hide the toggle. Open only if writing custom CSS that uses colors. |

When reading the user's submission, **`refs/submission-format-json.md`** documents the complete schema — top-level fields, full shape of `edits[]` / `comments[]` / `questions[]` / `customs[]`, locator types per comment kind, and read-back patterns (string → number / JSON casts, multi-valued name arrays). The marker points to `submission.toon`; **`refs/submission-format-toon.md`** maps the same schema onto TOON syntax (tabular vs expanded arrays, quoting, escapes). Open both after the user submits, before parsing — a quick glance at the TOON ref prevents misreading tabular cells.

## Approval gate — never execute without explicit confirmation

The page offers the user three buttons. Each one specifies what to do next; do not improvise.

### `APPROVED` — run the gate

The user clicked **Approve**. They want a sanity check before code is touched.

1. Restate the plan back in chat, integrating their edits, comments and answers. Be specific — quote their wording where they wrote things.
2. Wait for explicit go-ahead. "Yes", "go", "do it", "proceed" — anything unambiguous works. Silence, ambiguity, or a follow-up question do **not** count as approval.
3. If the user expresses doubt or asks for revisions, do not implement. Either revise the plan or have a clarifying conversation.
4. Once the user gives go-ahead, follow the `_instructions` array in the submission — it carries server-injected orchestration guidance for the implementation phase.

### `APPROVED_FAST` — gate explicitly bypassed

The user clicked **Approve & build**. Do not restate. Do not ask "shall I proceed". Acknowledge briefly ("starting now") and begin implementation.

This is a power-user shortcut. Honouring it means starting *now*, not after a paragraph of restatement. Apply the `_instructions` array in the submission immediately.

### `REJECTED` or `TIMEOUT` — do not implement

Acknowledge and ask the user what direction they want.

The `approval_mode` field inside the submission mirrors the outcome (`"gated"` or `"fast"`) — trust it as a tie-breaker if anything is ambiguous.

### Why this matters

The gate is a contract, not a courtesy. Skipping it on `APPROVED` betrays the user's wish to deliberate; running it on `APPROVED_FAST` betrays their explicit choice to skip the safety check.
