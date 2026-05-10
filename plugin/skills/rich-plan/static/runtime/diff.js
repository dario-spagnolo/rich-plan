/* Parse each <div class="diff"> as a unified diff and emit per-line spans
   the CSS can color. The optional data-file attribute renders a header
   row above the body.                                                    */

export function renderDiffs() {
  document.querySelectorAll(".diff").forEach((d) => {
    if (d.querySelector(".diff-line")) return;   // already rendered
    const file = d.dataset.file;
    const raw = d.textContent.replace(/^\n+|\n+$/g, "");
    d.textContent = "";

    if (file) {
      const h = document.createElement("div");
      h.className = "diff-header";
      h.textContent = file;
      d.appendChild(h);
    }

    const body = document.createElement("div");
    body.className = "diff-body";
    raw.split("\n").forEach((line) => {
      const span = document.createElement("span");
      span.className = "diff-line";
      if (line.startsWith("+++") || line.startsWith("---")) span.classList.add("hunk");
      else if (line.startsWith("@@")) span.classList.add("hunk");
      else if (line.startsWith("+")) span.classList.add("add");
      else if (line.startsWith("-")) span.classList.add("del");
      span.textContent = line || " ";
      body.appendChild(span);
    });
    d.appendChild(body);
  });
}
