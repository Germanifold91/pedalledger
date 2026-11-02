/* SVG charts for the Stats tab. Each takes already-computed numbers (see stats.js). */

import { el, css, showTip, hideTip } from "./dom.js";
import { fmtUSD, fmtUSDc, fmtDay, fmtDayShort } from "./format.js";
import { niceMax } from "./stats.js";

/* rounded-top vertical bar (4px data end, square baseline) */
function vBarPath(x, y, w, h){
  const r = Math.min(4, w/2, h);
  return `M${x},${y+h} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+w-r},${y} Q${x+w},${y} ${x+w},${y+r} L${x+w},${y+h} Z`;
}
/* rounded-right horizontal bar */
function hBarPath(x, y, w, h){
  const r = Math.min(4, h/2, w);
  return `M${x},${y} L${x+w-r},${y} Q${x+w},${y} ${x+w},${y+r} L${x+w},${y+h-r} Q${x+w},${y+h} ${x+w-r},${y+h} L${x},${y+h} Z`;
}
/* width actually available inside a chart card (view width minus card padding+border) */
const availW = () => Math.max(280, (document.getElementById("view").clientWidth || innerWidth - 24) - 30);

/** Card with a chart ⇄ table toggle. tableSpec: {cols, rows: () => string[][]} */
export function chartCard(title, buildSvg, tableSpec){
  const body = el("div", {});
  let mode = "chart";
  const tBtn = el("button", { class:"iconbtn", onclick:() => {
    mode = mode === "chart" ? "table" : "chart"; paint();
    tBtn.classList.toggle("active", mode === "table");
  }}, "⊞ table");
  function paint(){
    body.replaceChildren();
    hideTip();
    if (mode === "chart") body.appendChild(buildSvg());
    else {
      body.appendChild(el("table", { class:"chart-table" },
        el("thead", {}, el("tr", {}, tableSpec.cols.map((c, i) =>
          el("th", { class: i > 0 ? "num" : "" }, c)))),
        el("tbody", {}, tableSpec.rows().map(r =>
          el("tr", {}, r.map((v, i) => el("td", { class: i > 0 ? "num" : "" }, v)))))
      ));
    }
  }
  paint();
  return el("div", { class:"card" }, el("h2", {}, el("span", {}, title), tBtn), body);
}

/** Horizontal bars per category; tap a bar to show its subcategories. rows from categoryTotals(). */
export function categoryChart(rows){
  const maxV = niceMax(rows.length ? rows[0].usd : 1);
  const wrap = el("div", {});
  wrap.appendChild(el("p", { class:"hint", style:"margin-bottom:8px" }, "Tap a bar to see subcategories."));
  let openCat = null;

  function paint(){
    wrap.querySelectorAll(".cat-block").forEach(x => x.remove());
    const labelW = 118, barH = 18, rowH = 30, padR = 66;
    const W = availW();
    const barMax = W - labelW - padR;

    for (const r of rows) {
      const block = el("div", { class:"cat-block" });
      const name = r.cat ? r.cat.name : "Unknown";
      const svg = el("svg", { width:W, height:rowH, viewBox:`0 0 ${W} ${rowH}`, role:"img",
        "aria-label":`${name}: ${fmtUSD(r.usd)}` });
      const w = Math.max(2, (r.usd/maxV)*barMax);
      const y = (rowH-barH)/2;
      svg.appendChild(el("text", { x:0, y:rowH/2+4, "font-size":12, fill:css("--ink") },
        (r.cat ? r.cat.emoji + " " + r.cat.name : "Unknown").slice(0, 18)));
      svg.appendChild(el("path", { d:hBarPath(labelW, y, w, barH), fill:css("--s1") }));
      svg.appendChild(el("text", { x:labelW + w + 6, y:rowH/2+4, "font-size":11,
        fill:css("--ink-2"), style:"font-variant-numeric:tabular-nums" }, fmtUSD(r.usd)));
      const hit = el("rect", { x:0, y:0, width:W, height:rowH, fill:"transparent", style:"cursor:pointer" });
      const cid = r.cat ? r.cat.id : null;
      hit.addEventListener("click", () => { openCat = openCat === cid ? null : cid; paint(); });
      hit.addEventListener("pointermove", ev => showTip(ev.clientX, ev.clientY, [
        { text:fmtUSD(r.usd), strong:true },
        { text:name + " — tap for subcategories" }]));
      hit.addEventListener("pointerleave", hideTip);
      svg.appendChild(hit);
      block.appendChild(svg);

      if (openCat && r.cat && r.cat.id === openCat && r.subs.size) {
        const subs = [...r.subs.entries()].sort((a, b) => b[1] - a[1]);
        for (const [sl, sv] of subs) {
          const sh = 22, sBarH = 10;
          const ssvg = el("svg", { width:W, height:sh, viewBox:`0 0 ${W} ${sh}`, role:"img",
            "aria-label":`${sl}: ${fmtUSD(sv)}` });
          const sw = Math.max(2, (sv/maxV)*barMax);
          ssvg.appendChild(el("text", { x:16, y:sh/2+4, "font-size":11, fill:css("--ink-2") }, sl.slice(0, 17)));
          ssvg.appendChild(el("path", { d:hBarPath(labelW, (sh-sBarH)/2, sw, sBarH),
            fill:css("--s1"), opacity:.55 }));
          ssvg.appendChild(el("text", { x:labelW + sw + 6, y:sh/2+4, "font-size":10,
            fill:css("--muted"), style:"font-variant-numeric:tabular-nums" }, fmtUSD(sv)));
          block.appendChild(ssvg);
        }
      }
      wrap.appendChild(block);
    }
  }
  paint();
  return wrap;
}

/** Average day per country as bars with a target tick. rows from countryStats(). */
export function countryChart(rows){
  const maxV = niceMax(Math.max(...rows.map(r => Math.max(r.avg, r.target)), 1));
  const labelW = 96, barH = 18, rowH = 44, padR = 8;
  const W = availW();
  const barMax = W - labelW - padR - 60;
  const wrap = el("div", {});

  for (const r of rows) {
    const svg = el("svg", { width:W, height:rowH, viewBox:`0 0 ${W} ${rowH}`, role:"img",
      "aria-label":`${r.name}: average ${fmtUSD(r.avg)} per day, target ${fmtUSD(r.target)}` });
    const w = Math.max(2, (r.avg/maxV)*barMax);
    svg.appendChild(el("text", { x:0, y:16, "font-size":12, fill:css("--ink") }, r.name.slice(0, 14)));
    svg.appendChild(el("path", { d:hBarPath(labelW, 6, w, barH), fill:css("--s1") }));
    svg.appendChild(el("text", { x:labelW + w + 6, y:19, "font-size":11, fill:css("--ink-2"),
      style:"font-variant-numeric:tabular-nums" }, fmtUSD(r.avg)));
    if (r.target > 0) {
      const tx = labelW + (r.target/maxV)*barMax;
      svg.appendChild(el("line", { x1:tx, y1:2, x2:tx, y2:28, stroke:css("--ink"), "stroke-width":2 }));
      const over = r.avg > r.target;
      const pct = Math.round(Math.abs(r.avg/r.target - 1)*100);
      svg.appendChild(el("text", { x:labelW, y:40, "font-size":11,
        fill: over ? css("--critical") : css("--good-text"), "font-weight":600 },
        over ? `▲ ${pct}% over target (${fmtUSD(r.target)}/day)` : `▼ ${pct}% under target (${fmtUSD(r.target)}/day)`));
    } else {
      svg.appendChild(el("text", { x:labelW, y:40, "font-size":11, fill:css("--muted") },
        `${r.days} day${r.days > 1 ? "s" : ""} · no target set`));
    }
    const hit = el("rect", { x:0, y:0, width:W, height:rowH, fill:"transparent" });
    hit.addEventListener("pointermove", ev => showTip(ev.clientX, ev.clientY, [
      { text:fmtUSD(r.avg) + " / day", strong:true },
      { text:`${r.name} · ${r.days} day${r.days > 1 ? "s" : ""} · total ${fmtUSD(r.total)}` }]));
    hit.addEventListener("pointerleave", hideTip);
    svg.appendChild(hit);
    wrap.appendChild(svg);
  }
  return wrap;
}

/**
 * Daily bars (faint) with a rolling-average line on top, an optional target step line,
 * and dashed markers on days the country changed.
 *   bars, line: numbers per day   targets: numbers per day or null
 *   borders: [{index, label}]     windowLabel: e.g. "7-day average"
 */
export function trendChart(days, { bars, line, targets = null, borders = [], windowLabel, tip = () => [] }){
  const n = days.length;
  const plotH = 170, axisB = 22, padT = 18, padL = 40, padR = 12;
  const slot = Math.max(6, Math.min(44, (availW() - padL - padR) / n));
  const barW = Math.max(2, Math.min(22, slot - 2));
  const W = Math.ceil(padL + n*slot + padR), H = padT + plotH + axisB;
  const maxV = niceMax(Math.max(...bars, ...line, ...(targets || []), 1));
  const yOf = v => padT + plotH - (v/maxV)*plotH;
  const xMid = i => padL + i*slot + slot/2;

  const svg = el("svg", { width:W, height:H, viewBox:`0 0 ${W} ${H}`, role:"img",
    "aria-label": `Daily spend in US dollars with ${windowLabel}` });

  for (let i = 0; i <= 5; i++){
    const v = maxV*i/5, y = yOf(v);
    svg.appendChild(el("line", { x1:padL, y1:y, x2:W-padR, y2:y,
      stroke: i === 0 ? css("--axis") : css("--grid"), "stroke-width":1 }));
    svg.appendChild(el("text", { x:padL-6, y:y+3.5, "text-anchor":"end",
      "font-size":10, fill:css("--muted"), style:"font-variant-numeric:tabular-nums" }, fmtUSDc(v)));
  }

  // country changes: dashed line + short name, skipping labels that would collide
  let lastLabelX = -Infinity;
  for (const b of borders) {
    const x = padL + b.index*slot;
    svg.appendChild(el("line", { x1:x, y1:padT - 4, x2:x, y2:padT + plotH,
      stroke:css("--muted"), "stroke-width":1, "stroke-dasharray":"3 3" }));
    if (x - lastLabelX > 56) {
      svg.appendChild(el("text", { x:x + 3, y:padT - 6, "font-size":9.5, fill:css("--ink-2") }, b.label.slice(0, 10)));
      lastLabelX = x;
    }
  }

  // bars: the raw days, deliberately quiet
  bars.forEach((v, i) => {
    if (v <= 0) return;
    const y = yOf(v);
    svg.appendChild(el("path", { d:vBarPath(padL + i*slot + (slot-barW)/2, y, barW, padT+plotH-y),
      fill:css("--s1"), opacity:.28 }));
  });

  // target step line
  if (targets && targets.some(t => t > 0)) {
    const pts = [];
    targets.forEach((t, i) => pts.push(`${padL + i*slot},${yOf(t)}`, `${padL + (i+1)*slot},${yOf(t)}`));
    svg.appendChild(el("polyline", { points:pts.join(" "), fill:"none", stroke:css("--ink-2"), "stroke-width":1 }));
  }

  // the rolling average: the line that carries the story
  if (n > 1) {
    svg.appendChild(el("polyline", { points: line.map((v, i) => `${xMid(i)},${yOf(v)}`).join(" "),
      fill:"none", stroke:css("--s1"), "stroke-width":2.25, "stroke-linejoin":"round", "stroke-linecap":"round" }));
  }
  svg.appendChild(el("circle", { cx:xMid(n-1), cy:yOf(line[n-1]), r:3.5, fill:css("--s1"),
    stroke:css("--surface"), "stroke-width":1.5 }));

  // hit areas + x labels
  const k = Math.ceil(n/7);
  days.forEach((d, i) => {
    const hit = el("rect", { x:padL+i*slot, y:padT, width:slot, height:plotH+axisB, fill:"transparent" });
    const show = ev => showTip(ev.clientX, ev.clientY, [
      { text: fmtUSD(line[i]) + " / day avg", strong:true },
      { text: fmtDay(d) + " · spent " + fmtUSD(bars[i]) },
      ...tip(i)]);
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hideTip);
    svg.appendChild(hit);
    if (i === n-1 || (i % k === 0 && n-1-i >= k*0.6)) {
      svg.appendChild(el("text", { x:xMid(i), y:H-7, "text-anchor":"middle",
        "font-size":10, fill:css("--muted") }, fmtDayShort(d)));
    }
  });

  return el("div", { class:"chart-scroll" }, svg);
}

/** Tiny trend line for a list row; the last point is marked. */
export function sparkline(values, { w = 84, h = 26 } = {}){
  const max = Math.max(...values, 0.0001);
  const step = values.length > 1 ? (w - 4) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [2 + i*step, h - 3 - (v/max)*(h - 6)]);
  const svg = el("svg", { width:w, height:h, viewBox:`0 0 ${w} ${h}`, "aria-hidden":"true", class:"spark" });
  svg.appendChild(el("polyline", { points: pts.map(p => p.join(",")).join(" "), fill:"none",
    stroke:css("--s1"), "stroke-width":1.75, "stroke-linejoin":"round", "stroke-linecap":"round" }));
  const [lx, ly] = pts[pts.length - 1];
  svg.appendChild(el("circle", { cx:lx, cy:ly, r:2.5, fill:css("--s1") }));
  return svg;
}
