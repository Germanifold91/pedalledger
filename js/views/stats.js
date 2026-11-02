/* Stats tab.
   Top: the trip budget (always the whole trip). Then the range filter, which scopes
   everything below it: totals, the daily trend, category trends and breakdowns.
   One-offs count in totals and the budget, not in daily averages or trends. */

import { el } from "../dom.js";
import { S, countryById } from "../state.js";
import { fmtUSD, fmtDay } from "../format.js";
import { todayKey } from "../time.js";
import { rangeDays, summarize, countryStats, categoryTotals } from "../stats.js";
import { trendSeries, categoryTrends, borderDays, projection, tripStart, dailyEveryday } from "../trends.js";
import { render } from "../router.js";
import { chartCard, trendChart, sparkline, categoryChart, countryChart } from "../charts.js";
import { openTripEditor } from "./settings.js";

let RANGE = "trip"; // trip | 30 | 7 | today
let WINDOW = 7;     // rolling-average window, days
let openTrend = null; // category whose full trend chart is expanded
const RANGES = [["trip","Whole trip"], ["30","30 days"], ["7","7 days"], ["today","Today"]];
const RANGE_LABEL = { trip:"whole trip", "30":"last 30 days", "7":"last 7 days", today:"today" };
const WINDOWS = [7, 14, 30];

const pct = x => Math.round(Math.abs(x) * 100) + "%";
const shortDate = key => new Date(key + "T12:00:00Z").toLocaleDateString(undefined,
  { month:"short", day:"numeric", timeZone:"UTC" });

export function renderStats(view){
  if (!S.expenses.length) {
    view.appendChild(el("div", { class:"empty" }, "Charts appear once you've logged expenses."));
    return;
  }
  const today = todayKey();
  view.appendChild(budgetCard(today));

  view.appendChild(el("div", { class:"row", style:"margin-bottom:12px" },
    RANGES.map(([v, l]) => el("button", { class:"pill" + (RANGE === v ? " active" : ""),
      onclick:() => { RANGE = v; render(); } }, l))));

  const days = rangeDays(S.expenses, RANGE, today);
  const { inRange, everyday, total, oneOffTotal, avg, dailyTotals, dayCountry, targetSum } = summarize(S, days);
  const countryOf = d => countryById(dayCountry.get(d));
  const everydayTotal = total - oneOffTotal;

  /* --- hero + tiles --- */
  view.appendChild(el("div", { class:"hero" },
    el("div", { class:"lbl" }, "Total spent — " + RANGE_LABEL[RANGE]),
    el("div", { class:"val" }, fmtUSD(total)),
    oneOffTotal > 0 ? el("div", { class:"hero-sub" }, `includes ${fmtUSD(oneOffTotal)} in one-offs`) : ""));

  const paceDelta = targetSum > 0 ? (everydayTotal - targetSum) / targetSum : null;
  view.appendChild(el("div", { class:"tiles" },
    el("div", { class:"tile" },
      el("div", { class:"lbl" }, "Average per day"),
      el("div", { class:"val" }, fmtUSD(avg)),
      el("div", { class:"delta" }, days.length + (days.length === 1 ? " day" : " days") +
        (oneOffTotal > 0 ? " · without one-offs" : ""))),
    el("div", { class:"tile" },
      el("div", { class:"lbl" }, "Pace vs target"),
      el("div", { class:"val" }, paceDelta === null ? "—" :
        (paceDelta > 0 ? "+" : "") + Math.round(paceDelta * 100) + "%"),
      paceDelta === null
        ? el("div", { class:"delta" }, "no targets set")
        : el("div", { class:"delta " + (paceDelta > 0 ? "bad" : "good") },
            paceDelta > 0 ? `▲ ${fmtUSD(everydayTotal - targetSum)} over budget` : `▼ ${fmtUSD(targetSum - everydayTotal)} under budget`))
  ));

  /* --- daily trend with rolling average --- */
  const start = tripStart(S, today);
  if (days.length > 1) {
    const bars = days.map(d => dailyTotals.get(d) || 0);
    const line = trendSeries(S, days, WINDOW, { start });
    const targets = days.map(d => countryOf(d)?.dailyTargetUSD || 0);
    const borders = borderDays(days, dayCountry).map(b => ({ ...b, label: countryById(b.countryId)?.name || "" }));
    view.appendChild(trendCard({
      title: "Daily spend",
      days, bars, line, targets, borders,
      tip: i => [{ text: countryOf(days[i]) ? `target ${fmtUSD(targets[i])} · ${countryOf(days[i]).name}` : "no target" }],
      table: { cols:["Day","Spent",`${WINDOW}-day avg`,"Target"],
        rows:() => days.map((d, i) => [fmtDay(d), fmtUSD(bars[i]), fmtUSD(line[i]), targets[i] ? fmtUSD(targets[i]) : "—"]) },
    }));
  }

  /* --- category trends --- */
  const trends = categoryTrends(S, today, WINDOW);
  if (trends.length) view.appendChild(categoryTrendsCard(trends, days, start));

  /* --- where the money went (one-offs included) --- */
  const cats = categoryTotals(S, inRange);
  view.appendChild(chartCard("By category", () => categoryChart(cats), {
    cols:["Category","Spent","Share"],
    rows:() => cats.flatMap(r => [...r.subs.entries()].map(([sl, v]) => [
      (r.cat ? r.cat.name : "Unknown") + (sl === "(no subcategory)" ? "" : " · " + sl), v]))
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, fmtUSD(v), total ? Math.round(v / total * 100) + "%" : "—"])
  }));

  /* --- by country (everyday spend vs target) --- */
  const countries = countryStats(S, everyday, days, dayCountry);
  if (countries.length) {
    view.appendChild(chartCard("Average day by country", () => countryChart(countries), {
      cols:["Country","Avg / day","Target","Δ"],
      rows:() => countries.map(r =>
        [r.name, fmtUSD(r.avg), fmtUSD(r.target),
         r.target > 0 ? (r.avg > r.target ? "▲ " : "▼ ") + Math.round(Math.abs(r.avg / r.target - 1) * 100) + "%" : "—"])
    }));
  }

  view.appendChild(el("p", { class:"hint", style:"text-align:center;padding:4px 0 10px" },
    "All values in USD at the rate snapshotted when each expense was logged. One-offs count in totals and the budget, not in daily averages or trends."));
}

/* ---------- trip budget ---------- */
function budgetCard(today){
  const p = projection(S, today, { paceWindow: 30 });
  if (!p.budget) {
    return el("div", { class:"card budget-empty" },
      el("div", { class:"mid" },
        el("div", { class:"t1" }, "How long will the money last?"),
        el("div", { class:"hint" }, `Spent ${fmtUSD(p.spent)} so far. Set a trip budget to see the projection.`)),
      el("button", { class:"btn small", onclick:() => openTripEditor() }, "Set budget"));
  }
  const over = p.left < 0;
  const lines = [];
  lines.push(el("div", {}, `Spent ${fmtUSD(p.spent)} in ${p.elapsed} day${p.elapsed === 1 ? "" : "s"}` +
    (p.oneOffs > 0 ? `, including ${fmtUSD(p.oneOffs)} in one-offs` : "") + "."));
  lines.push(el("div", {}, `Recent pace: `, el("b", {}, fmtUSD(p.pace) + "/day"),
    ` (last ${p.paceDays} day${p.paceDays === 1 ? "" : "s"}, one-offs excluded).`));
  if (!over) {
    lines.push(el("div", {}, Number.isFinite(p.daysLeft)
      ? ["At that pace the money lasts ", el("b", {}, `~${Math.floor(p.daysLeft)} more days`), `, until ${shortDate(p.runsOut)}.`]
      : "No everyday spending recently, so no projection yet."));
  }
  let verdict = "";
  if (p.end && p.remainingDays) {
    verdict = el("div", { class:"verdict " + (p.onTrack ? "good" : "bad") },
      p.left <= 0
        ? `▲ Budget used up, with ${p.remainingDays} days to go until ${shortDate(p.end)}.`
        : p.onTrack
          ? `✓ On track for ${shortDate(p.end)}: ${fmtUSD(p.perDay)}/day available for the ${p.remainingDays} days left.`
          : `▲ To reach ${shortDate(p.end)}, spend ${fmtUSD(p.perDay)}/day for the ${p.remainingDays} days left — ${fmtUSD(p.pace - p.perDay)}/day less than now.`);
  }
  return el("div", { class:"card budget" },
    el("h2", {}, "Trip budget", el("button", { class:"iconbtn", onclick:() => openTripEditor() }, "edit")),
    el("div", { class:"meter-row" },
      el("div", { class:"big" + (over ? " neg" : "") }, over ? fmtUSD(-p.left) : fmtUSD(p.left),
        el("small", {}, over ? " over budget" : ` left of ${fmtUSD(p.budget)}`)),
      el("div", { class:"hint" }, Math.round(p.usedShare * 100) + "% used")),
    el("div", { class:"meter" }, el("div", { style:`width:${Math.min(100, p.usedShare * 100)}%;` +
      `background:${over ? "var(--critical)" : p.usedShare > .9 ? "var(--warning)" : "var(--s1)"}` })),
    el("div", { class:"budget-lines" }, ...lines),
    verdict);
}

/* ---------- trend card with window switch ---------- */
function windowPills(){
  return el("div", { class:"chips win-pills", role:"radiogroup", "aria-label":"Average over" },
    WINDOWS.map(w => el("button", { type:"button", class:"pill" + (w === WINDOW ? " active" : ""),
      role:"radio", "aria-checked":String(w === WINDOW), onclick:() => { WINDOW = w; render(); } }, `${w}d`)));
}

function trendCard({ title, days, bars, line, targets, borders, tip, table }){
  const card = chartCard(title, () => trendChart(days, { bars, line, targets, borders, tip,
    windowLabel: `${WINDOW}-day average` }), table);
  const legend = el("div", { class:"legend" },
    el("span", { class:"lg-line" }), `${WINDOW}-day average`,
    el("span", { class:"lg-bar" }), "each day",
    targets ? [el("span", { class:"lg-target" }), "target"] : "",
    borders?.length ? [el("span", { class:"lg-border" }), "new country"] : "");
  card.insertBefore(el("div", { class:"trend-head" }, windowPills(), legend), card.children[1]);
  return card;
}

/* ---------- category trends ---------- */
function categoryTrendsCard(rows, days, start){
  const card = el("div", { class:"card" },
    el("h2", {}, `Category trends`, el("span", { class:"hint" }, `avg/day, last ${WINDOW} days`)),
    el("div", { class:"trend-head" }, windowPills(),
      el("div", { class:"hint" }, rows.some(r => r.change !== null)
        ? `▲▼ compared with the ${WINDOW} days before`
        : `Week-on-week changes appear once the trip is ${2 * WINDOW} days old`)));
  for (const r of rows) {
    const id = r.cat.id;
    const change = r.change === null ? el("span", { class:"chg" }, "—")
      : Math.abs(r.change) < 0.005 ? el("span", { class:"chg" }, "±0%")
      : el("span", { class:"chg " + (r.change > 0 ? "up" : "down") }, (r.change > 0 ? "▲ " : "▼ ") + pct(r.change));
    const row = el("button", { type:"button", class:"trend-row" + (openTrend === id ? " open" : ""),
      "aria-expanded": String(openTrend === id),
      onclick:() => { openTrend = openTrend === id ? null : id; render(); } },
      el("span", { class:"e" }, r.cat.emoji),
      el("span", { class:"name" }, r.cat.name),
      sparkline(r.spark),
      el("span", { class:"val" }, fmtUSD(r.current)),
      change);
    card.appendChild(row);
    if (openTrend === id && days.length > 1) {
      const line = trendSeries(S, days, WINDOW, { catId:id, start });
      const bars = dailyEveryday(S, days, id);
      card.appendChild(el("div", { class:"trend-detail" },
        trendChart(days, { bars, line, windowLabel:`${WINDOW}-day average for ${r.cat.name}` }),
        el("p", { class:"hint" }, r.previous !== null
          ? `${r.cat.name}: ${fmtUSD(r.current)}/day over the last ${WINDOW} days, ${fmtUSD(r.previous)}/day the ${WINDOW} before.`
          : `${r.cat.name}: ${fmtUSD(r.current)}/day so far.`)));
    }
  }
  return card;
}
