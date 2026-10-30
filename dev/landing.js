// For each callout: which painted part is on top at the leader's dot? Glass is skipped unless it is the callout's own.
(() => {
  const svg = document.querySelector(".um-stage svg");
  const out = [];
  for (const g of document.querySelectorAll(".um-call")) {
    const id = g.dataset.c;
    const dot = g.querySelector(".um-dot");
    const m = svg.getScreenCTM();
    const p = new DOMPoint(+dot.getAttribute("cx"), +dot.getAttribute("cy")).matrixTransform(m);
    const its = document.elementsFromPoint(p.x, p.y).map((el) => el.closest(".it")).filter(Boolean);
    const seen = [...new Set(its)];
    const top = seen.find((it) => (it.dataset.c || "").split(" ").includes(id) || !it.querySelector(".um-glass"));
    const ok = top && (top.dataset.c || "").split(" ").includes(id);
    if (!ok) out.push(`${id}→${top ? (top.dataset.c ? "#" + top.dataset.c : "") + "[" + top.dataset.i + "]" : "nothing"}`);
  }
  return out.length ? "MISS " + out.join(" ") : "all on their parts";
})()
