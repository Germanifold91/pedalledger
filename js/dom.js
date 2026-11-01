/* Tiny DOM toolkit: element builder, toast, bottom-sheet modal, chart tooltip.
   el() only ever uses textContent for strings — user text is untrusted. */

const SVG_TAGS = new Set(["svg","g","path","rect","line","circle","text","polyline","title"]);

export function el(tag, attrs, ...kids){
  const isSvg = SVG_TAGS.has(tag);
  const n = isSvg ? document.createElementNS("http://www.w3.org/2000/svg", tag)
                  : document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") isSvg ? n.setAttribute("class", v) : (n.className = v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.appendChild(typeof kid === "string" || typeof kid === "number"
      ? document.createTextNode(String(kid)) : kid);
  }
  return n;
}

/** Read a CSS custom property (charts bake colors in at render time). */
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

let toastTimer;
export function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/** Bottom sheet. build(sheet, close) fills it; tap outside or Esc closes. */
export function modal(build){
  const overlay = el("div", { class:"overlay", onclick:(ev) => { if (ev.target === overlay) close(); } });
  const sheet = el("div", { class:"sheet" }, el("div", { class:"grab" }));
  overlay.appendChild(sheet);
  function close(){ overlay.remove(); document.removeEventListener("keydown", esc); }
  function esc(ev){ if (ev.key === "Escape") close(); }
  document.addEventListener("keydown", esc);
  build(sheet, close);
  document.body.appendChild(overlay);
  return close;
}

export function showTip(x, y, rows){
  const tip = document.getElementById("tooltip");
  tip.replaceChildren(...rows.map(r =>
    el("div", {}, el("span", { class: r.strong ? "tv" : "tl" }, r.text))));
  tip.style.display = "block";
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x - r.width/2)) + "px";
  tip.style.top  = Math.max(6, y - r.height - 12) + "px";
}
export function hideTip(){
  const tip = document.getElementById("tooltip");
  if (tip) tip.style.display = "none";
}
