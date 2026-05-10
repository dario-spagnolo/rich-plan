# Brief template for rich-plan-designer subagents

Copy this template, fill the placeholders, send it as the prompt to each `rich-plan-designer` subagent. Only the bias section changes between the 2-3 prompts; every other section is identical across the trio.

## Template

```
You are a `rich-plan-designer` subagent. Two or three peers with different
biases are running in parallel. Defend YOUR bias; don't hedge.

## User request (verbatim)

{{ paste the user's original request, unedited — no paraphrase }}

## Code map (findings from Phase 2 exploration)

Files of interest:
- `path/to/file.ext` — {{ what's there, what role it plays }}
- ...

Existing utilities to consider for reuse:
- `function_name` (`path:line`) — {{ what it does }}
- ...

Patterns observed in the codebase:
- {{ e.g. error handling style, naming convention, test layout, idiom for X }}

## Constraints

- Timeline: {{ e.g. "ships before Friday's release", or "no deadline" }}
- Performance: {{ e.g. "hot path, every µs counts", or "off-line job, latency irrelevant" }}
- Compatibility: {{ e.g. "public API, no breaking changes" or "internal only, free to break" }}
- Other: {{ anything else the user mentioned }}

## Your bias

**{{ bias name, e.g. "simplicity-first" }}**

{{ paste the one-line bias statement from refs/bias-recipes.md verbatim }}
```

## Tips for filling the template

- **Code map** — keep it tight. The agent doesn't need the whole exploration log; it needs the file paths, function names, and patterns it will design against. A bullet list of 5-15 lines is the sweet spot.
- **Constraints** — only what the user actually said. Don't manufacture constraints to make the bias more interesting; that produces unrealistic designs.
- **Bias** — copy the statement from `bias-recipes.md` literally. Paraphrasing softens the bias; softness is the failure mode you're avoiding.
- **Same brief, different bias** — when you fan out, the only field that changes between the 2-3 prompts is `## Your bias`. That's intentional: it makes the trio's divergence directly attributable to bias rather than to varying inputs.
