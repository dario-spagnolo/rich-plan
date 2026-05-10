# Bias recipes for designer subagents

When the orchestrator launches 2-3 `rich-plan-designer` subagents in parallel, each must carry a **single, explicit bias** that genuinely diverges from the others. Pick the trio that matches the task type. Strong biases produce useful divergence; wishy-washy biases collapse to the same design and waste the fan-out.

## New feature

| Bias | One-line statement to inject |
|------|------------------------------|
| simplicity-first | Defend the smallest, most boring change. Reuse before invent. If a function within two file-hops does 80% of the job, claim it does 100%. New abstractions must justify their existence in one sentence or be cut. |
| robustness-first | Optimize for surviving edge cases and future churn. Validate inputs at module boundaries. Prefer explicit state to implicit. Where a structure could grow, make growth painless even if today's call site is trivial. |
| performance-first | Optimize for hot-path latency and resource use. Prefer in-place mutation, batching, and avoiding allocations. Acceptable to add complexity at the call site if it removes a per-iteration cost. |

## Bug fix

| Bias | One-line statement to inject |
|------|------------------------------|
| surgical-fix | Change the minimum number of bytes that resolves the symptom. Do not refactor surrounding code. Do not generalize. Add a regression test only for this exact case. |
| root-cause | Find the underlying invariant that was violated and restore it, even if the fix lives several frames above the symptom. Be willing to touch shared code to remove the entire class of bug. |
| prevention-upstream | Make the bug structurally impossible to recur. Move validation earlier in the pipeline. Promote runtime checks to type-level constraints if the language allows. The fix may not be in the file the bug was reported in. |

## Refactor

| Bias | One-line statement to inject |
|------|------------------------------|
| minimal-touch | Improve readability and remove duplication only within the files explicitly named in the request. Do not expand scope. The diff should be auditable in 5 minutes. |
| clean-architecture | Restructure for the boundaries that should exist, not the ones that do. Move types and helpers to where they belong even if it means touching many files. Acceptable to break private API if the call sites are within scope. |
| staged-incremental | Produce a refactor sequence in 3-5 small commits, each independently shippable. Earlier stages add the new structure alongside the old; later stages migrate call sites; the final stage removes the old code. Defend mid-stage states as production-safe. |

## How the orchestrator picks

- The trio is determined by task type (above). Fan out all three by default.
- If the user has signalled a clear preference, drop the bias that contradicts it. *"We can't afford to break compat"* drops `clean-architecture`. *"Deadline tomorrow"* drops `staged-incremental`. Two designers is enough when one bias is already off the table.
- For genuinely simple tasks (one file, no architectural debate), skip the biased designers entirely and compose the plan directly. The orchestrator's hesitation is the trigger: *if I could pick a clear winner alone, no fan-out.*
