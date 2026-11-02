/* Stats tab. The range filter at the top scopes everything below it. */

import { el } from "../dom.js";
import { S, countryById } from "../state.js";
import { fmtUSD, fmtDay } from "../format.js";
import { todayKey } from "../time.js";
import { rangeDays, summarize, countryStats, categoryTotals } from "../stats.js";
import { render } from "../router.js";
import { chartCard, dailyChart, categoryChart, countryChart } from "../charts.js";

let RANGE = "trip"; // trip | 30 | 7 | today
const RANGES = [["trip","Whole trip"], ["30","30 days"], ["7","7 days"], ["today","Today"]];
const RANGE_LABEL = { trip:"whole trip", "30":"last 30 days", "7":"last 7 days", today:"today" };

export function renderStats(view){
  if (!S.expenses.length) {
    view.appendChild(el("div", { class:"empty" }, "Charts appear once you've logged expenses."));
    return;
  }

  view.appendChild(el("div", { class:"row", style:"margin-bottom:12px" },
    RANGES.map(([v, l]) => el("button", { class:"pill" + (RANGE === v ? " active" : ""),
      onclick:() => { RANGE = v; render(); } }, l))));

  const days = rangeDays(S.expenses, RANGE, todayKey());
  const { inRange, total, avg, dailyTotals, dayCountry, targetSum } = summarize(S, days);
  const countryOf = d => countryById(dayCountry.get(d));

  /* --- hero + tiles --- */
  view.appendChild(el("div", { class:"hero" },
    el("div", { class:"lbl" }, "Total spent — " + RANGE_LABEL[RANGE]),
    el("div", { class:"val" }, fmtUSD(total))));

  const paceDelta = targetSum > 0 ? (total - targetSum) / targetSum : null;
  view.appendChild(el("div", { class:"tiles" },
    el("div", { class:"tile" },
      el("div", { class:"lbl" }, "Average per day"),
      el("div", { class:"val" }, fmtUSD(avg)),
      el("div", { class:"delta" }, days.length + (days.length === 1 ? " day" : " days"))),
    el("div", { class:"tile" },
      el("div", { class:"lbl" }, "Pace vs target"),
      el("div", { class:"val" }, paceDelta === null ? "—" :
        (paceDelta > 0 ? "+" : "") + Math.round(paceDelta * 100) + "%"),
      paceDelta === null
        ? el("div", { class:"delta" }, "no targets set")
        : el("div", { class:"delta " + (paceDelta > 0 ? "bad" : "good") },
            paceDelta > 0 ? `▲ ${fmtUSD(total - targetSum)} over budget` : `▼ ${fmtUSD(targetSum - total)} under budget`))
  ));

  /* --- daily spend --- */
  if (days.length > 1) {
    view.appendChild(chartCard("Daily spend (USD)", () => dailyChart(days, dailyTotals, countryOf), {
      cols:["Day","Spent","Target"],
      rows:() => days.map(d => {
        const c = countryOf(d);
        return [fmtDay(d), fmtUSD(dailyTotals.get(d) || 0), c ? fmtUSD(c.dailyTargetUSD) : "—"];
      })
    }));
  }

  /* --- by category --- */
  const cats = categoryTotals(S, inRange);
  view.appendChild(chartCard("By category", () => categoryChart(cats), {
    cols:["Category","Spent","Share"],
    rows:() => cats.flatMap(r => [...r.subs.entries()].map(([sl, v]) => [
      (r.cat ? r.cat.name : "Unknown") + (sl === "(no subcategory)" ? "" : " · " + sl), v]))
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, fmtUSD(v), total ? Math.round(v / total * 100) + "%" : "—"])
  }));

  /* --- by country --- */
  const countries = countryStats(S, inRange, days, dayCountry);
  if (countries.length) {
    view.appendChild(chartCard("Average day by country", () => countryChart(countries), {
      cols:["Country","Avg / day","Target","Δ"],
      rows:() => countries.map(r =>
        [r.name, fmtUSD(r.avg), fmtUSD(r.target),
         r.target > 0 ? (r.avg > r.target ? "▲ " : "▼ ") + Math.round(Math.abs(r.avg / r.target - 1) * 100) + "%" : "—"])
    }));
  }

  view.appendChild(el("p", { class:"hint", style:"text-align:center;padding:4px 0 10px" },
    "All values in USD at the rate snapshotted when each expense was logged."));
}
