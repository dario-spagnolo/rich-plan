# Rich blocks — code, diffs, file trees, mermaid, pills

The visual content that distinguishes rich-plan from a markdown plan. Each is auto-instrumented; standard HTML suffices.

## Code blocks — `<pre><code class="language-…">`

Use standard HTML5 code blocks. The runtime loads highlight.js from a CDN and applies syntax coloring. Code blocks are commentable line-by-line (hover reveals 💬, click adds a per-line marker).

```html
<pre><code class="language-python">def issue(user_id: str) -> str:
    return jwt.encode({"sub": user_id}, SECRET, "HS256")
</code></pre>
```

Supported languages are anything highlight.js handles. Common shortcuts: `language-python`, `language-typescript`, `language-bash`, `language-json`, `language-html`, `language-css`.

## Unified diffs — `<div class="diff" data-file="…">`

Drop a raw unified diff. The runtime parses it and colors adds / dels / hunks. The optional `data-file` attribute renders a file-path header.

```html
<div class="diff" data-file="src/auth/middleware.py">
@@ -1,4 +1,7 @@
 from fastapi import Request
-from .sessions import load_session
+from .jwt import verify
+from .sessions import load_session  # legacy fallback
</div>
```

> **Don't HTML-escape** the diff content unless the diff itself contains literal `<` or `>` — the runtime treats the inner text as plain text.

Diffs are not commentable line-by-line (yet). For per-line comments on diff content, render it as a `<pre><code class="language-diff">` instead.

## File trees — `<div class="file-tree">`

Use a nested `<ul>` with `class="file"` or `class="dir"` on each `<li>`. Append a `<span class="action create|edit|delete">` to mark intent.

```html
<div class="file-tree">
  <ul>
    <li class="dir">src/
      <ul>
        <li class="file">auth.py <span class="action edit">EDIT</span></li>
        <li class="file">jwt.py  <span class="action create">CREATE</span></li>
      </ul>
    </li>
    <li class="file">tests/test_auth.py <span class="action edit">EDIT</span></li>
  </ul>
</div>
```

Each line is commentable: hovering reveals 💬, and the comment carries `target_locator: { path, action }` to pinpoint a specific file in the tree.

## Diagrams — `<div class="mermaid">`

Drop Mermaid source directly. The runtime loads mermaid.js from a CDN and renders on first paint.

```html
<div class="mermaid">
graph LR
    A[Request] --> B{Bearer token?}
    B -- yes --> C[Verify JWT]
    B -- no --> D[401]
    C --> E[Proceed]
</div>
```

After render, individual nodes, edges and clusters become commentable (hover reveals 💬, click leaves a comment with `target_locator: { id, kind }`). Use diagrams for flows, sequences and architectures — not as decoration. **One diagram per concept.**

## Pills and badges — `<span class="rp-pill">`

Inline status indicators for headers or meta lines.

```html
<span class="rp-pill success">low risk</span>
<span class="rp-pill warn">touches prod data</span>
<span class="rp-pill danger">irreversible</span>
```

Three flavours: `success` (green), `warn` (amber), `danger` (red). Bare `.rp-pill` (no flavour) gives a neutral grey.

## Tables

Standard `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>`. Each cell becomes commentable individually (`target_locator: { row, col }`, both 0-based, counting `<thead>` rows). Tables get the same neutral styling as the rest of the plan.

## Style and substance

- Each section should focus on one concept, with a short prose intro followed by the rich element (code, diff, tree, diagram).
- Prefer **one diagram + one code excerpt** over a wall of text. The HTML medium is the whole point.
- Stale rich content is worse than no rich content. If a code excerpt or file path wasn't actually verified, mark it as illustrative rather than presenting it as truth.
