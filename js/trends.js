/* Trends and the trip budget: rolling averages, per-category trends, border days,
   and how long the money lasts. Pure functions, no DOM.

   "Everyday" spending excludes one-offs (visa, flight, new wheel): one-offs still
   count toward totals and the budget, but would distort averages and trends. */

import { dayOf, addDays, dayRange } from "./time.js";

export const isEveryday = e => !e.oneOff;

/** First day of the trip: the date set in Settings, else the first expense, else today. */
export function tripStart(state, today){
  const set = state.settings.trip?.startDay;
  if (set) return set;
  return state.expenses.reduce((a, e) => { const k = dayOf(e); return k < a ? k : a; }, today);
}

export const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

/** Everyday spend per day for the given days (optionally one category). */
export function dailyEveryday(state, days, catId = null){
  const idx = new Map(days.map((d, i) => [d, i]));
  const out = new Array(days.length).fill(0);
  for (const e of state.expenses) {
    if (!isEveryday(e) || (catId && e.catId !== catId)) continue;
    const i = idx.get(dayOf(e));
    if (i !== undefined) out[i] += e.usd;
  }
  return out;
}

/** Trailing mean: each point averages itself and up to w−1 points before it. */
export function rolling(values, w){
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= w) sum -= values[i - w];
    out.push(sum / Math.min(w, i + 1));
  }
  return out;
}

/**
 * Rolling average of everyday spend for each of `days`, using days before the range
 * (back to the trip start) so the line is already settled when the range begins.
 */
export function trendSeries(state, days, w, { catId = null, start } = {}){
  if (!days.length) return [];
  const from = addDays(days[0], -(w - 1));
  const begin = start && start > from ? start : from;
  const ext = dayRange(begin <= days[0] ? begin : days[0], days[days.length - 1]);
  const roll = rolling(dailyEveryday(state, ext, catId), w);
  return roll.slice(ext.length - days.length);
}

/**
 * Per-category trend, anchored at today:
 *   current  — average everyday spend per day over the last w days
 *   previous — the same for the w days before that (null until the trip is 2w days old)
 *   change   — current vs previous, as a fraction (null when it can't be computed)
 *   spark    — the rolling series over the last `sparkDays` days, for a small chart
 * Categories with no everyday spend in the last 2w days are left out.
 */
export function categoryTrends(state, today, w, { sparkDays = 30 } = {}){
  const start = tripStart(state, today);
  const elapsed = daysBetween(start, today) + 1;
  const curDays = Math.min(w, elapsed);
  const recent = dayRange(addDays(today, -(Math.min(2 * w, elapsed) - 1)), today);
  const sparkRange = dayRange(addDays(today, -(Math.min(sparkDays, elapsed) - 1)), today);
  const rows = [];
  for (const cat of state.categories) {
    const vals = dailyEveryday(state, recent, cat.id);
    if (!vals.some(v => v > 0)) continue;
    const cur = vals.slice(-curDays).reduce((a, b) => a + b, 0) / curDays;
    let previous = null, change = null;
    if (elapsed >= 2 * w) {
      previous = vals.slice(0, w).reduce((a, b) => a + b, 0) / w;
      change = previous > 0 ? cur / previous - 1 : null;
    }
    rows.push({ cat, current: cur, previous, change,
      spark: trendSeries(state, sparkRange, w, { catId: cat.id, start }) });
  }
  return rows.sort((a, b) => b.current - a.current);
}

/** Days on which the "home" country changed from the day before (dayCountry from stats.summarize). */
export function borderDays(days, dayCountry){
  const out = [];
  for (let i = 1; i < days.length; i++) {
    const a = dayCountry.get(days[i - 1]), b = dayCountry.get(days[i]);
    if (b && a !== b) out.push({ day: days[i], index: i, countryId: b });
  }
  return out;
}

/**
 * The trip budget, as of today.
 *   spent    — everything since the trip start, one-offs included
 *   pace     — everyday spend per day over the last `paceWindow` days (or since the start)
 *   daysLeft — how long what's left lasts at that pace
 *   perDay   — with a planned end date: what can be spent per day after today
 */
export function projection(state, today, { paceWindow = 30 } = {}){
  const trip = state.settings.trip || {};
  const budget = trip.budgetUSD > 0 ? trip.budgetUSD : null;
  const start = tripStart(state, today);
  const spent = state.expenses.filter(e => dayOf(e) >= start).reduce((a, e) => a + e.usd, 0);
  const oneOffs = state.expenses.filter(e => !isEveryday(e) && dayOf(e) >= start).reduce((a, e) => a + e.usd, 0);
  const elapsed = Math.max(1, daysBetween(start, today) + 1);
  const paceDays = Math.min(paceWindow, elapsed);
  const pace = dailyEveryday(state, dayRange(addDays(today, -(paceDays - 1)), today)).reduce((a, b) => a + b, 0) / paceDays;

  const out = { budget, start, spent, oneOffs, elapsed, pace, paceDays, end: trip.endDay || null };
  if (!budget) return out;
  out.left = budget - spent;
  out.usedShare = spent / budget;
  out.daysLeft = out.left <= 0 ? 0 : pace > 0 ? out.left / pace : Infinity;
  out.runsOut = Number.isFinite(out.daysLeft) ? addDays(today, Math.floor(out.daysLeft)) : null;
  if (out.end && out.end > today) {
    out.remainingDays = daysBetween(today, out.end);
    out.perDay = out.left / out.remainingDays;
    out.onTrack = out.left > 0 && pace <= out.perDay;
  }
  return out;
}
