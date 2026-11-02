/* CSV export: one row per expense, oldest first. date/time are local to where the
   expense was logged; utc_offset says which zone that was (e.g. +03:00). */

import { dayOf, timeOf } from "./time.js";

export const CSV_COLUMNS = ["date","time","amount","currency","local_per_usd","usd",
  "country","category","subcategory","note","utc_offset"];

export function csvEscape(v){
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function isoOffset(tz){
  const sign = tz < 0 ? "-" : "+", a = Math.abs(tz || 0);
  return sign + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0");
}

export function buildCSV(state){
  const lines = [CSV_COLUMNS.join(",")];
  const sorted = [...state.expenses].sort((a, b) => a.ts.localeCompare(b.ts));
  for (const e of sorted) {
    const cat = state.categories.find(c => c.id === e.catId);
    const sub = cat?.subs.find(s => s.id === e.subId);
    const cc = state.countries.find(c => c.id === e.countryId);
    lines.push([
      dayOf(e), timeOf(e), e.amount, e.currency, e.perUSD, e.usd.toFixed(2),
      cc ? cc.name : "", cat ? cat.name : "", sub ? sub.name : "", e.note || "", isoOffset(e.tz),
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}
