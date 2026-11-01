// These tests must pass no matter what time zone the machine is in;
// `npm test` runs them under several TZ settings to prove it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wallClock, fromWallClock, dayOf, timeOf, addDays, dayRange, fmtOffset } from "../js/time.js";
import { rangeDays, summarize } from "../js/stats.js";

const ISTANBUL = 180, BISHKEK = 360, BOGOTA = -300, KATHMANDU = 345;

test("a late dinner stays on the day it was eaten", () => {
  // 23:30 in Istanbul on 10 May
  const e = { ts: fromWallClock("2026-05-10T23:30", ISTANBUL), tz: ISTANBUL };
  assert.equal(e.ts, "2026-05-10T20:30:00.000Z");
  assert.equal(dayOf(e), "2026-05-10");
  assert.equal(timeOf(e), "23:30");
});

test("an early breakfast stays on its day too", () => {
  const e = { ts: fromWallClock("2026-07-01T06:15", BISHKEK), tz: BISHKEK };
  assert.equal(e.ts, "2026-07-01T00:15:00.000Z");
  assert.equal(dayOf(e), "2026-07-01");
});

test("wallClock and fromWallClock round-trip at any offset", () => {
  for (const tz of [ISTANBUL, BISHKEK, BOGOTA, KATHMANDU, 0, 480, -600]) {
    const wall = "2026-12-31T23:59";
    assert.equal(wallClock(fromWallClock(wall, tz), tz), wall);
  }
});

test("day helpers cross month and year boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2027-03-01", -1), "2027-02-28");
  assert.deepEqual(dayRange("2026-12-30", "2027-01-02"),
    ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
});

test("fmtOffset", () => {
  assert.equal(fmtOffset(180), "UTC+3");
  assert.equal(fmtOffset(345), "UTC+5:45");
  assert.equal(fmtOffset(-300), "UTC−5");
});

test("daily totals use the day where each expense was logged", () => {
  const state = {
    settings: { currentCountryId: "kg" },
    countries: [{ id:"tr", name:"Turkey", dailyTargetUSD:30 }, { id:"kg", name:"Kyrgyzstan", dailyTargetUSD:25 }],
    expenses: [
      { ts: fromWallClock("2026-05-10T23:30", ISTANBUL), tz: ISTANBUL, usd: 12, countryId:"tr" },
      { ts: fromWallClock("2026-05-11T08:00", BISHKEK), tz: BISHKEK, usd: 5,  countryId:"kg" },
    ],
  };
  const days = rangeDays(state.expenses, "trip", "2026-05-11");
  assert.deepEqual(days, ["2026-05-10", "2026-05-11"]);
  const s = summarize(state, days);
  assert.equal(s.dailyTotals.get("2026-05-10"), 12);
  assert.equal(s.dailyTotals.get("2026-05-11"), 5);
  assert.equal(s.targetSum, 30 + 25);
});
