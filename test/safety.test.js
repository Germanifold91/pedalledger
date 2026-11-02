import { test } from "node:test";
import assert from "node:assert/strict";
import { backupStatus, backupMessage, backupFileName, snapshotsToDelete, needsDailySnapshot, KEEP_DAILY, KEEP_OTHER } from "../js/safety.js";
import { fromWallClock, offsetAt } from "../js/time.js";

const NOW = Date.parse("2027-06-10T12:00:00Z");
const st = (settings, n = 0) => ({
  settings,
  expenses: Array.from({ length:n }, (_, i) => ({ ts:`2027-06-0${1 + (i % 9)}T10:00:00.000Z` })),
  cash: [],
});

test("never backed up: every record counts, nag once it's 2 days old", () => {
  const s = backupStatus(st({ rev:3 }, 5), NOW);
  assert.equal(s.changes, 5);
  assert.equal(s.never, true);
  assert.equal(s.days, 9);           // first record 1 June
  assert.equal(s.nag, true);
  assert.match(backupMessage(s), /5 changes and no backup yet/);
});

test("recent backup with a few changes: no nag", () => {
  const s = backupStatus(st({ rev:12, backupRev:10, lastBackup:"2027-06-10T08:00:00Z" }, 5), NOW);
  assert.deepEqual([s.changes, s.days, s.nag], [2, 0, false]);
});

test("many changes nag even on the same day", () => {
  const s = backupStatus(st({ rev:30, backupRev:10, lastBackup:"2027-06-10T08:00:00Z" }, 5), NOW);
  assert.equal(s.nag, true);
  assert.match(backupMessage(s), /20 changes since your last backup \(earlier today\)/);
});

test("old backup but nothing changed since: no nag", () => {
  const s = backupStatus(st({ rev:10, backupRev:10, lastBackup:"2027-05-01T08:00:00Z" }, 5), NOW);
  assert.equal(s.nag, false);
});

test("backup file names carry local date and time", () => {
  const name = backupFileName(new Date("2027-06-10T12:34:00Z"));
  assert.match(name, /^pedalledger-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  // matches the phone's wall clock
  const tz = offsetAt(new Date("2027-06-10T12:34:00Z"));
  const wall = new Date(Date.parse("2027-06-10T12:34:00Z") + tz * 6e4).toISOString();
  assert.equal(name, `pedalledger-backup-${wall.slice(0, 10)}-${wall.slice(11, 13)}${wall.slice(14, 16)}.json`);
});

test("retention keeps one daily copy per day for 14 days, plus 5 others", () => {
  const list = [];
  for (let d = 1; d <= 20; d++) {
    const day = `2027-06-${String(d).padStart(2, "0")}`;
    list.push({ id:`d${d}a`, ts:`${day}T08:00:00Z`, day, reason:"daily" });
    list.push({ id:`d${d}b`, ts:`${day}T20:00:00Z`, day, reason:"daily" });   // a second copy the same day
  }
  for (let i = 1; i <= 8; i++) list.push({ id:`r${i}`, ts:`2027-06-0${i}T09:00:00Z`, reason:"before restore" });
  const gone = new Set(snapshotsToDelete(list));
  const kept = list.filter(s => !gone.has(s.id)).map(s => s.id);
  assert.equal(kept.filter(id => id.startsWith("d")).length, KEEP_DAILY);
  assert.ok(kept.includes("d20b") && !kept.includes("d20a"));   // newest of the day
  assert.ok(!kept.includes("d6b"));                              // older than 14 days
  assert.deepEqual(kept.filter(id => id.startsWith("r")).sort(), ["r4", "r5", "r6", "r7", "r8"].slice(0, KEEP_OTHER));
});

test("a daily snapshot is taken once per local day, and only when there's data", () => {
  const now = new Date(fromWallClock("2027-06-10T07:00", offsetAt(new Date("2027-06-10T07:00:00Z"))));
  const today = new Date(Date.parse(now.toISOString()) + offsetAt(now) * 6e4).toISOString().slice(0, 10);
  const withData = st({}, 1);
  assert.equal(needsDailySnapshot([], withData, now), true);
  assert.equal(needsDailySnapshot([{ reason:"daily", day:today }], withData, now), false);
  assert.equal(needsDailySnapshot([{ reason:"before restore", day:today }], withData, now), true);
  assert.equal(needsDailySnapshot([], st({}, 0), now), false);
});
