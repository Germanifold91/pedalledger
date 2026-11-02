import { test } from "node:test";
import assert from "node:assert/strict";
import { rolling, trendSeries, categoryTrends, borderDays, projection, tripStart, daysBetween } from "../js/trends.js";
import { summarize } from "../js/stats.js";
import { dayRange, addDays } from "../js/time.js";

// expenses logged at noon UTC with tz 0, so dayOf() is just the date
const ex = (day, usd, catId = "food", extra = {}) => ({ ts:`${day}T12:00:00.000Z`, tz:0, usd, catId, countryId:"kg", ...extra });
const state = (expenses, trip = {}) => ({
  settings: { currentCountryId:"kg", trip },
  countries: [{ id:"kg", name:"Kyrgyzstan", dailyTargetUSD:25 }, { id:"kz", name:"Kazakhstan", dailyTargetUSD:30 }],
  categories: [{ id:"food", name:"Food", subs:[] }, { id:"lodg", name:"Lodging", subs:[] }, { id:"bike", name:"Bike", subs:[] }],
  expenses,
});

test("rolling mean uses a partial window at the start, then a full one", () => {
  assert.deepEqual(rolling([10, 20, 30, 40], 2), [10, 15, 25, 35]);
  assert.deepEqual(rolling([7, 7, 7], 7), [7, 7, 7]);
});

test("days with no spending count as zero in the rolling average", () => {
  const s = state([ex("2027-06-01", 20), ex("2027-06-03", 40)]);
  const days = dayRange("2027-06-01", "2027-06-03");
  assert.deepEqual(trendSeries(s, days, 3, { start:"2027-06-01" }), [20, 10, 20]);
});

test("the trend line looks back before the visible range so it's settled from day one", () => {
  const s = state(dayRange("2027-06-01", "2027-06-10").map(d => ex(d, d <= "2027-06-07" ? 10 : 40)));
  const last3 = dayRange("2027-06-08", "2027-06-10");
  const t = trendSeries(s, last3, 7, { start:"2027-06-01" });
  // 8 June: days 2–8 = six 10s and one 40 → 100/7
  assert.equal(t[0], (6 * 10 + 40) / 7);
  assert.equal(t[2], (4 * 10 + 3 * 40) / 7);
});

test("one-offs stay out of trends and daily averages but count in totals", () => {
  const s = state([ex("2027-06-01", 20), ex("2027-06-01", 160, "food", { oneOff:true }), ex("2027-06-02", 30)]);
  const days = dayRange("2027-06-01", "2027-06-02");
  assert.deepEqual(trendSeries(s, days, 2, { start:"2027-06-01" }), [20, 25]);
  const sum = summarize(s, days);
  assert.equal(sum.total, 210);
  assert.equal(sum.oneOffTotal, 160);
  assert.equal(sum.avg, 25);
  assert.equal(sum.dailyTotals.get("2027-06-01"), 20);
});

test("category trends compare the last week with the week before", () => {
  const days = dayRange("2027-06-01", "2027-06-14");
  const s = state([
    ...days.map(d => ex(d, d <= "2027-06-07" ? 10 : 15, "food")),   // food up 50%
    ...days.map(d => ex(d, d <= "2027-06-07" ? 20 : 10, "lodg")),   // lodging down 50%
  ]);
  const rows = categoryTrends(s, "2027-06-14", 7);
  const food = rows.find(r => r.cat.id === "food"), lodg = rows.find(r => r.cat.id === "lodg");
  assert.equal(food.current, 15); assert.equal(food.previous, 10); assert.equal(food.change, 0.5);
  assert.equal(lodg.current, 10); assert.equal(lodg.change, -0.5);
  assert.equal(rows.find(r => r.cat.id === "bike"), undefined);      // nothing spent → no row
  assert.equal(food.spark.length, 14);
});

test("no week-on-week change until the trip is two windows old", () => {
  const s = state(dayRange("2027-06-01", "2027-06-05").map(d => ex(d, 10)));
  const [food] = categoryTrends(s, "2027-06-05", 7);
  assert.equal(food.current, 10);       // averaged over the 5 days so far, not 7
  assert.equal(food.change, null);
});

test("border days mark where the country changes", () => {
  const days = dayRange("2027-06-01", "2027-06-04");
  const dc = new Map([["2027-06-01","kg"], ["2027-06-02","kg"], ["2027-06-03","kz"], ["2027-06-04","kz"]]);
  assert.deepEqual(borderDays(days, dc), [{ day:"2027-06-03", index:2, countryId:"kz" }]);
});

test("projection: money left, pace from recent everyday spend, how long it lasts", () => {
  const days = dayRange("2027-06-01", "2027-06-30");
  const s = state([...days.map(d => ex(d, 20)), ex("2027-06-15", 160, "food", { oneOff:true })],
    { budgetUSD: 2000, endDay:"2027-08-29" });
  const p = projection(s, "2027-06-30");
  assert.equal(p.spent, 760);              // 30×20 + 160 visa
  assert.equal(p.left, 1240);
  assert.equal(p.pace, 20);                // the visa doesn't change the pace
  assert.equal(p.daysLeft, 62);
  assert.equal(p.runsOut, addDays("2027-06-30", 62));
  assert.equal(p.remainingDays, 60);
  assert.equal(p.perDay, 1240 / 60);
  assert.equal(p.onTrack, true);
});

test("projection without a budget still reports spending; with a start date ignores pre-trip buys", () => {
  const s = state([ex("2027-05-01", 300, "bike"), ex("2027-06-01", 20)], { startDay:"2027-06-01" });
  assert.equal(tripStart(s, "2027-06-01"), "2027-06-01");
  const p = projection(s, "2027-06-01");
  assert.equal(p.budget, null);
  assert.equal(p.spent, 20);
  assert.equal(daysBetween("2027-06-01", "2027-06-30"), 29);
});
