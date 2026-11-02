/* Pure number-crunching for the Stats tab. No DOM here, so it's all unit-testable. */

import { dayOf, addDays, dayRange } from "./time.js";

export const sumUSD = list => list.reduce((a, e) => a + e.usd, 0);

/** Day keys covered by a range ("trip" | "30" | "7" | "today"), ending today. */
export function rangeDays(expenses, range, today){
  if (!expenses.length) return [];
  let start;
  if (range === "today") start = today;
  else if (range === "7" || range === "30") start = addDays(today, -(Number(range) - 1));
  else start = expenses.reduce((a, e) => { const k = dayOf(e); return k < a ? k : a; }, today);
  return dayRange(start, today);
}

/**
 * Totals for a set of days. Daily figures (dailyTotals, avg) leave out one-off expenses;
 * `total` includes them.
 * dayCountry: the country each day "belongs to" for targets — the one with the most
 * spend that day, carried forward over days with no spending.
 */
export function summarize(state, days){
  const daySet = new Set(days);
  const inRange = state.expenses.filter(e => daySet.has(dayOf(e)));
  const everyday = inRange.filter(e => !e.oneOff);
  const total = sumUSD(inRange);                 // everything, one-offs included
  const oneOffTotal = total - sumUSD(everyday);
  const everydayTotal = sumUSD(everyday);
  const avg = days.length ? everydayTotal / days.length : 0;   // one-offs would distort a daily average

  const dailyTotals = new Map(days.map(d => [d, 0]));          // everyday spend per day
  const perDayCountry = new Map();
  for (const e of inRange) {
    const k = dayOf(e);
    if (!e.oneOff) dailyTotals.set(k, dailyTotals.get(k) + e.usd);
    if (!perDayCountry.has(k)) perDayCountry.set(k, new Map());
    const m = perDayCountry.get(k);
    m.set(e.countryId, (m.get(e.countryId) || 0) + e.usd);
  }
  const dayCountry = new Map();
  let lastCid = state.settings.currentCountryId;
  for (const d of days) {
    const m = perDayCountry.get(d);
    if (m && m.size) lastCid = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    dayCountry.set(d, lastCid);
  }
  const byId = new Map(state.countries.map(c => [c.id, c]));
  const targetSum = days.reduce((a, d) => a + (byId.get(dayCountry.get(d))?.dailyTargetUSD || 0), 0);

  return { inRange, everyday, total, everydayTotal, oneOffTotal, avg, dailyTotals, dayCountry, targetSum };
}

/** Per-country average spend per day vs target. Pass everyday expenses (no one-offs). */
export function countryStats(state, inRange, days, dayCountry){
  const m = new Map();
  for (const e of inRange) m.set(e.countryId, (m.get(e.countryId) || 0) + e.usd);
  const dayCounts = new Map();
  for (const d of days) {
    const cid = dayCountry.get(d);
    if (m.has(cid)) dayCounts.set(cid, (dayCounts.get(cid) || 0) + 1);
  }
  return [...m.entries()].map(([cid, usd]) => {
    const c = state.countries.find(x => x.id === cid);
    const nd = Math.max(1, dayCounts.get(cid) || 1);
    return { name: c ? c.name : "Unknown", avg: usd / nd, days: nd,
             target: c ? c.dailyTargetUSD : 0, total: usd };
  }).sort((a, b) => b.total - a.total);
}

/** Spend per category, with a subcategory split for drill-down. Sorted high → low. */
export function categoryTotals(state, inRange){
  const agg = new Map();
  for (const e of inRange) {
    if (!agg.has(e.catId)) agg.set(e.catId, { usd:0, subs:new Map() });
    const a = agg.get(e.catId);
    a.usd += e.usd;
    const cat = state.categories.find(c => c.id === e.catId);
    const sub = cat?.subs.find(s => s.id === e.subId);
    const sl = sub ? sub.name : "(no subcategory)";
    a.subs.set(sl, (a.subs.get(sl) || 0) + e.usd);
  }
  return [...agg.entries()]
    .map(([cid, a]) => ({ cat: state.categories.find(c => c.id === cid), ...a }))
    .sort((a, b) => b.usd - a.usd);
}

/** Round an axis maximum up to 1, 2, 2.5 or 5 × a power of ten. */
export function niceMax(v){
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}
