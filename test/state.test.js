import { test } from "node:test";
import assert from "node:assert/strict";
import { migrate, validate, freshState, SCHEMA_VERSION, load, KEY } from "../js/state.js";
import { readBackup } from "../js/backup.js";
import { buildCSV, isoOffset } from "../js/csv.js";

const v1 = () => ({
  version: 1,
  settings: { homeCurrency:"USD", currentCountryId:"c1", lastBackup:null },
  countries: [{ id:"c1", name:"Colombia", currency:"COP", perUSD:4000, dailyTargetUSD:40 }],
  categories: [{ id:"k1", name:"Food", emoji:"🍜", archived:false, subs:[{ id:"s1", name:"Restaurant", archived:false }] }],
  expenses: [{ id:"e1", ts:"2026-03-01T02:00:00.000Z", amount:40000, currency:"COP",
               perUSD:4000, usd:10, countryId:"c1", catId:"k1", subId:"s1", note:"bandeja, paisa" }],
});

test("fresh state is current and valid", () => {
  const s = freshState();
  assert.equal(s.version, SCHEMA_VERSION);
  assert.deepEqual(validate(s), []);
});

test("v1 → v2 adds the logging offset and leaves the original untouched", () => {
  const old = v1();
  const m = migrate(old, { offsetOf: () => -300 });
  assert.equal(m.version, 2);
  assert.equal(m.expenses[0].tz, -300);
  assert.equal(old.expenses[0].tz, undefined);
  assert.deepEqual(validate(m), []);
});

test("migrating twice changes nothing", () => {
  const once = migrate(v1(), { offsetOf: () => -300 });
  assert.deepEqual(migrate(once, { offsetOf: () => 999 }), once);
});

test("backups from a newer app version are refused", () => {
  assert.throws(() => migrate({ ...v1(), version: SCHEMA_VERSION + 1 }), /newer version/);
});

test("validate catches broken references and bad numbers", () => {
  const d = migrate(v1(), { offsetOf: () => 0 });
  d.expenses[0].countryId = "nope";
  d.expenses.push({ id:"e2", ts:"not a date", amount:-1, perUSD:1, usd:1, countryId:"c1", catId:"k1" });
  const p = validate(d);
  assert.ok(p.some(x => /missing country/.test(x)));
  assert.ok(p.some(x => /bad date/.test(x)));
  assert.ok(p.some(x => /bad amount/.test(x)));
});

test("readBackup accepts a v1 file and rejects junk", () => {
  assert.ok(readBackup(JSON.stringify(v1())).data);
  assert.match(readBackup("{oops").error, /valid JSON/);
  assert.match(readBackup(JSON.stringify({ expenses:[] })).error, /problems/);
});

test("load never discards data it can't read", () => {
  const store = new Map([[KEY, "{corrupted"]]);
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = load(storage);
  assert.equal(s.expenses.length, 0);
  const parked = [...store.keys()].find(k => k.startsWith(KEY + ".unreadable-"));
  assert.ok(parked);
  assert.equal(store.get(parked), "{corrupted");
});

test("CSV uses local date/time, quotes commas, and appends the offset", () => {
  const csv = buildCSV(migrate(v1(), { offsetOf: () => -300 }));
  const [head, row] = csv.split("\n");
  assert.equal(head, "date,time,amount,currency,local_per_usd,usd,country,category,subcategory,note,utc_offset");
  // 02:00 UTC on 1 March was 21:00 on 28 Feb in Bogotá
  assert.equal(row, '2026-02-28,21:00,40000,COP,4000,10.00,Colombia,Food,Restaurant,"bandeja, paisa",-05:00');
  assert.equal(isoOffset(345), "+05:45");
});
