/* Automatic copies of the data kept on the phone, in IndexedDB (room for many
   copies; localStorage would run out). They protect against a bad edit, a wrong
   import or a bug — not against losing the phone. For that, back up to iCloud Drive.
   Every function fails soft: if IndexedDB is unavailable, snapshots are simply off. */

import { uid } from "./state.js";
import { nowWallClock } from "./time.js";
import { snapshotsToDelete, needsDailySnapshot } from "./safety.js";

const DB_NAME = "pedalledger", STORE = "snapshots";
let dbPromise;

function db(){
  if (!globalThis.indexedDB) return Promise.reject(new Error("no IndexedDB"));
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath:"id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function run(mode, fn){
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out?.result ?? out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/** Newest first, without the data itself. [] if snapshots aren't available. */
export async function listSnapshots(){
  try {
    const all = await run("readonly", s => s.getAll());
    return all.map(({ data, ...meta }) => meta).sort((a, b) => b.ts.localeCompare(a.ts));
  } catch { return []; }
}

export async function readSnapshot(id){
  const rec = await run("readonly", s => s.get(id));
  return rec ? JSON.parse(rec.data) : null;
}

/** Save a copy of state. reason: "daily" | "before restore" | "before import". */
export async function takeSnapshot(state, reason){
  const now = new Date();
  const rec = {
    id: uid(), ts: now.toISOString(), day: nowWallClock(now).slice(0, 10), reason,
    expenses: state.expenses.length, cash: state.cash?.length || 0,
    data: JSON.stringify(state),
  };
  try {
    await run("readwrite", s => s.put(rec));
    await prune();
    return rec.id;
  } catch { return null; }
}

async function prune(){
  const doomed = snapshotsToDelete(await listSnapshots());
  if (doomed.length) await run("readwrite", s => doomed.forEach(id => s.delete(id)));
}

/** Called on start-up: the first time the app opens each day, keep a copy. */
export async function dailySnapshot(state){
  try {
    if (needsDailySnapshot(await listSnapshots(), state)) await takeSnapshot(state, "daily");
  } catch { /* snapshots unavailable — the app works without them */ }
}
