# Theming — light / dark

The runtime ships with two themes. The user toggles between them via the floating button in the top-right corner; their explicit choice is persisted in `localStorage` under the key `rp-theme`. With no override, the theme follows `prefers-color-scheme` and live-updates if the OS preference changes.

The plan author does not need to do anything to support both themes. Every color in `base.css` is a CSS custom property; `[data-theme="dark"]` on `<html>` swaps the values.

## Anti-FOUC

`server.py` injects a small inline `<script>` at the top of `<head>` that resolves the theme synchronously, *before* the stylesheet paints. This is the standard way to avoid a flash-of-light-content when the user has chosen dark mode. The bootstrap script runs even when the plan is opened directly from disk, but in that case `setupTheme()` (in `runtime/theme.js`) re-applies the resolved theme as a fallback.

## Available tokens

For `<style>` blocks inside `plan.html`, prefer these custom properties over hard-coded colors so your additions theme correctly:

| Token | Purpose |
|-------|---------|
| `--rp-bg`, `--rp-bg-soft`, `--rp-bg-edit` | Page / container / edit-state backgrounds |
| `--rp-text`, `--rp-text-muted` | Body text, secondary text |
| `--rp-border`, `--rp-border-soft` | Container borders, dividers |
| `--rp-accent`, `--rp-accent-bg`, `--rp-accent-hover` | Primary action / link colors |
| `--rp-success`, `--rp-warn`, `--rp-danger` | Semantic foregrounds |
| `--rp-add-bg`, `--rp-add-text`, `--rp-add-border` | Diff / pill "additive" tints |
| `--rp-del-bg`, `--rp-del-text`, `--rp-del-border` | Diff / pill "destructive" tints |
| `--rp-edit-bg`, `--rp-edit-text`, `--rp-edit-border` | "Modified" tints |
| `--rp-shadow-soft`, `--rp-shadow-pop`, `--rp-shadow-bar`, `--rp-shadow-modal` | Drop-shadows tuned per theme |

## Reacting to theme changes from `plan.html`

The runtime emits a `rp:theme-change` CustomEvent on `document` when the theme actually changes. Listen for it from a custom `<script>` in `plan.html` if your plan embeds a third-party widget that needs explicit re-theming:

```js
document.addEventListener("rp:theme-change", (e) => {
  // e.detail.theme === "light" | "dark"
  // e.detail.previous === the prior theme
});
```

`highlight.js` and `mermaid` are already wired up — they swap their stylesheet / re-render automatically on each event.

## Forcing a single theme

To pin a plan to one theme regardless of user preference, set the attribute directly in `plan.html` (or your full-document HTML):

```html
<html data-theme="dark">
```

The user's toggle and `localStorage` will still let them switch. To remove the toggle entirely, hide it via inline CSS:

```html
<style>.rp-theme-toggle { display: none; }</style>
```
