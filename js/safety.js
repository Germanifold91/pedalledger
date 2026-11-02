/* Data-safety rules: when to nag about backups, what backup files are called,
   and which on-phone snapshots to keep. Pure functions — no DOM, no storage. */

import { nowWallClock } from "./time.js";

const DAY = 864e5;

/**
 * How at-risk the data is.
 *   changes: saves since the last backup (every logged expense, edit, withdrawal… is one)
 *   days:    whole days since the last backup, or since the first record if never backed up
 *   nag:     whether the Log screen should show the reminder
 */
export function backupStatus(state, now = Date.now()){
  const { rev = 0, backupRev = 0, lastBackup } = state.settings;
  const records = state.expenses.length + (state.cash?.length || 0);
  let changes = Math.max(0, rev - backupRev);
  if (!lastBackup) changes = Math.max(changes, records);   // never backed up: everything is at risk

  let since = lastBackup;
  if (!since && records) {
    since = [...state.expenses, ...(state.cash || [])].reduce((a, r) => r.ts < a ? r.ts : a, "9999");
  }
  const days = since ? Math.max(0, Math.floor((now - Date.parse(since)) / DAY)) : 0;
  const nag = changes > 0 && (changes >= 15 || days >= 2);
  return { changes, days, nag, never: !lastBackup };
}

export function backupMessage({ changes, days, never }){
  const c = `${changes} change${changes === 1 ? "" : "s"}`;
  if (never) return `${c} and no backup yet. If the phone goes, they go with it.`;
  const ago = days === 0 ? "earlier today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `${c} since your last backup (${ago}). If the phone goes, they go with it.`;
}

/** Backup file name with local date and time, so backups in iCloud Drive never overwrite each other. */
export function backupFileName(date = new Date(), ext = "json"){
  const stamp = nowWallClock(date).replace("T", "-").replace(":", "");
  return `pedalledger-backup-${stamp}.${ext}`;
}

export const KEEP_DAILY = 14;     // one per day for the last 14 days the app was opened
export const KEEP_OTHER = 5;      // the last 5 "before restore" / "before import" copies

/**
 * Given snapshot metadata [{id, ts, day, reason}], return the ids to delete.
 * Keeps the newest "daily" snapshot from each of the 14 most recent days that have one,
 * plus the 5 newest snapshots taken for any other reason.
 */
export function snapshotsToDelete(list){
  const newest = [...list].sort((a, b) => b.ts.localeCompare(a.ts));
  const keep = new Set();
  const days = new Set();
  for (const s of newest.filter(s => s.reason === "daily")) {
    const day = s.day || s.ts.slice(0, 10);
    if (days.has(day) || days.size >= KEEP_DAILY) continue;
    days.add(day); keep.add(s.id);
  }
  newest.filter(s => s.reason !== "daily").slice(0, KEEP_OTHER).forEach(s => keep.add(s.id));
  return list.filter(s => !keep.has(s.id)).map(s => s.id);
}

/** Whether today's daily snapshot still needs taking. */
export function needsDailySnapshot(list, state, now = new Date()){
  if (!state.expenses.length && !(state.cash?.length)) return false;
  const today = nowWallClock(now).slice(0, 10);
  return !list.some(s => s.reason === "daily" && s.day === today);
}
