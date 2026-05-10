/* Pure helpers shared across the runtime. No DOM mutation here — that
   belongs to the modules that use them.                                 */

export function slugify(text) {
  const base = text.trim().toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")  // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || "section";
}

/* Resolve the on-screen rectangle for a 1-line slice inside a <pre><code>.
   Used both by hover detection and by per-line marker placement. Returns
   null if the line is empty or out of range — callers must skip it.     */
export function getLineRectViaRange(codeEl, lineIdx) {
  const text = codeEl.textContent;
  const lines = text.split("\n");
  if (lineIdx < 0 || lineIdx >= lines.length) return null;
  if (!lines[lineIdx].length) return null;
  let charStart = 0;
  for (let i = 0; i < lineIdx; i++) charStart += lines[i].length + 1;
  const charEnd = charStart + lines[lineIdx].length;
  const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0, startSet = false, node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startSet && pos + len > charStart) {
      range.setStart(node, charStart - pos);
      startSet = true;
    }
    if (startSet && pos + len >= charEnd) {
      range.setEnd(node, charEnd - pos);
      const r = range.getBoundingClientRect();
      if (r.height === 0) return null;
      return r;
    }
    pos += len;
  }
  return null;
}

/* Pull { path, action } out of a tree-line wrap. The .action badge is
   always a direct child of the wrap; everything else concatenated is the
   path label.                                                            */
export function treeLineInfo(wrap) {
  const action = wrap.querySelector(".action")?.textContent.trim() || null;
  let path = "";
  for (const node of wrap.childNodes) {
    if (node.nodeType === 1 && node.classList?.contains("action")) continue;
    path += node.textContent;
  }
  return { path: path.trim(), action };
}

/* --- CDN loaders -------------------------------------------------------- */
export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("load failed: " + src));
    document.head.appendChild(s);
  });
}

export function loadStyle(href) {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

const HL_BASE  = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/";
const HL_LIGHT = HL_BASE + "github.min.css";
const HL_DARK  = HL_BASE + "github-dark.min.css";

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function setHighlightTheme(theme) {
  let link = document.getElementById("rp-hljs-theme");
  if (!link) {
    link = document.createElement("link");
    link.id  = "rp-hljs-theme";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = theme === "dark" ? HL_DARK : HL_LIGHT;
}

export async function maybeLoadHighlight() {
  if (!document.querySelector('pre code[class*="language-"]')) return;
  setHighlightTheme(currentTheme());
  await loadScript("https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js");
  if (window.hljs) window.hljs.highlightAll();
  document.addEventListener("rp:theme-change", (e) => setHighlightTheme(e.detail.theme));
}

export async function maybeLoadMermaid() {
  if (!document.querySelector(".mermaid")) return;
  await loadScript("https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js");
  if (!window.mermaid) return;

  /* Cache each diagram's source so we can re-render after a theme swap.
     mermaid.run() replaces the inner HTML with an SVG, which would lose
     the original source on the second pass.                            */
  document.querySelectorAll(".mermaid").forEach((el) => {
    if (!el.dataset.rpSource) el.dataset.rpSource = el.textContent;
  });

  const renderAll = async (theme) => {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "neutral",
      securityLevel: "loose",
    });
    document.querySelectorAll(".mermaid").forEach((el) => {
      el.removeAttribute("data-processed");
      el.innerHTML = el.dataset.rpSource;
    });
    try { await window.mermaid.run({ querySelector: ".mermaid" }); } catch (e) { console.warn("mermaid:", e); }
  };

  await renderAll(currentTheme());
  document.addEventListener("rp:theme-change", (e) => renderAll(e.detail.theme));
}
