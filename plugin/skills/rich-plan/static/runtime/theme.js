/* Theme resolution + toggle. The initial paint is handled by an inline
   script in server.py (see PRELUDE_HEAD) to avoid FOUC; this module only
   wires up the floating toggle, persists explicit overrides, and emits
   `rp:theme-change` so highlight.js / mermaid can re-theme themselves. */

const KEY = "rp-theme";
const MQ  = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function apply(theme, { persist = true, emit = true } = {}) {
  const root = document.documentElement;
  const previous = currentTheme();
  if (previous === theme) return;
  root.setAttribute("data-theme", theme);
  if (persist) {
    try { localStorage.setItem(KEY, theme); } catch { /* private mode etc. */ }
  }
  if (emit) {
    document.dispatchEvent(new CustomEvent("rp:theme-change", {
      detail: { theme, previous },
    }));
  }
}

export function setupTheme() {
  /* Make sure data-theme is set even if the inline bootstrap script is
     missing (e.g. plan opened directly from disk without the server). */
  if (!document.documentElement.getAttribute("data-theme")) {
    let initial = null;
    try { initial = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (initial !== "light" && initial !== "dark") {
      initial = MQ.matches ? "dark" : "light";
    }
    apply(initial, { persist: false, emit: false });
  }

  /* Floating toggle button. */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rp-theme-toggle";
  btn.title = "Basculer le thème clair / sombre";
  btn.setAttribute("aria-label", "Basculer le thème clair / sombre");
  btn.innerHTML = `<span class="rp-theme-icon" aria-hidden="true"></span>`;
  btn.addEventListener("click", () => {
    apply(currentTheme() === "dark" ? "light" : "dark");
  });
  document.body.appendChild(btn);

  /* Follow the OS preference until the user has explicitly overridden. */
  const handler = (e) => {
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (stored === "light" || stored === "dark") return;
    apply(e.matches ? "dark" : "light", { persist: false });
  };
  if (MQ.addEventListener) MQ.addEventListener("change", handler);
  else if (MQ.addListener) MQ.addListener(handler);  // older Safari
}
