/* App state: one JSON document, persisted to localStorage.
   Shape changes go through migrate() so old data and old backups keep loading. */

import { offsetAt } from "./time.js";

export const KEY = "pedalledger.v1";   // storage key never changes; `version` inside does
export const SCHEMA_VERSION = 2;

export const DEFAULT_CATEGORIES = [
  { name:"Food",         emoji:"🍜", subs:["Groceries","Restaurant","Snacks & coffee"] },
  { name:"Lodging",      emoji:"🏠", subs:["Camping","Hostel","Hotel"] },
  { name:"Bike",         emoji:"🔧", subs:["Parts","Repairs","Rental"] },
  { name:"Transport",    emoji:"🚆", subs:["Train","Bus","Ferry","Flight"] },
  { name:"Gear",         emoji:"🎒", subs:[] },
  { name:"Fun & sights", emoji:"🎟️", subs:["Sights","Nightlife"] },
  { name:"Health",       emoji:"💊", subs:["Pharmacy","Doctor","Insurance"] },
  { name:"Misc",         emoji:"📱", subs:["SIM & data","Laundry","Fees"] },
];

export function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function freshState(){
  return {
    version: SCHEMA_VERSION,
    settings: { homeCurrency:"USD", currentCountryId:null, lastBackup:null },
    countries: [],   // {id,name,currency,perUSD,dailyTargetUSD}
    categories: DEFAULT_CATEGORIES.map(c => ({
      id: uid(), name:c.name, emoji:c.emoji, archived:false,
      subs: c.subs.map(s => ({ id: uid(), name:s, archived:false }))
    })),
    expenses: []     // {id,ts,tz,amount,currency,perUSD,usd,countryId,catId,subId,note}
  };
}

/* ---------- migrations: version N → N+1 ---------- */
const MIGRATIONS = {
  // v2: each expense remembers the UTC offset where it was logged.
  // Old expenses get the offset this device had at that instant — the best guess available.
  1: (d, { offsetOf }) => {
    for (const e of d.expenses) if (typeof e.tz !== "number") e.tz = offsetOf(new Date(e.ts));
  },
};

export function migrate(data, { offsetOf = offsetAt } = {}){
  const d = structuredClone(data);
  let v = Number(d.version) || 1;
  if (v > SCHEMA_VERSION) throw new Error("This backup is from a newer version of PedalLedger — update the app first.");
  while (v < SCHEMA_VERSION) { MIGRATIONS[v](d, { offsetOf }); v++; }
  d.version = SCHEMA_VERSION;
  d.settings = { homeCurrency:"USD", currentCountryId:null, lastBackup:null, ...d.settings };
  return d;
}

/* ---------- validation (used on import, before anything is replaced) ---------- */
export function validate(d){
  const problems = [];
  const isStr = v => typeof v === "string" && v.length > 0;
  const isPos = v => typeof v === "number" && Number.isFinite(v) && v > 0;
  if (!d || typeof d !== "object") return ["not a JSON object"];
  for (const k of ["expenses", "countries", "categories"])
    if (!Array.isArray(d[k])) problems.push(`missing "${k}" list`);
  if (problems.length) return problems;

  const countryIds = new Set(), catIds = new Set();
  d.countries.forEach((c, i) => {
    if (!isStr(c?.id) || !isStr(c?.name) || !/^[A-Z]{3}$/.test(c?.currency) || !isPos(c?.perUSD))
      problems.push(`country #${i+1} is incomplete`);
    else countryIds.add(c.id);
  });
  d.categories.forEach((c, i) => {
    if (!isStr(c?.id) || !isStr(c?.name) || !Array.isArray(c?.subs))
      problems.push(`category #${i+1} is incomplete`);
    else catIds.add(c.id);
  });
  d.expenses.forEach((e, i) => {
    const where = `expense #${i+1}`;
    if (!isStr(e?.id)) problems.push(`${where} has no id`);
    if (!isStr(e?.ts) || Number.isNaN(Date.parse(e.ts))) problems.push(`${where} has a bad date`);
    if (!isPos(e?.amount) || !isPos(e?.perUSD) || typeof e?.usd !== "number" || !Number.isFinite(e.usd))
      problems.push(`${where} has a bad amount or rate`);
    if (!countryIds.has(e?.countryId)) problems.push(`${where} points to a missing country`);
    if (!catIds.has(e?.catId)) problems.push(`${where} points to a missing category`);
  });
  return problems;
}

/* ---------- the live state (ES modules give importers a live binding to S) ---------- */
export let S = freshState();
export function setState(next){ S = next; }

export function load(storage = globalThis.localStorage){
  const text = storage.getItem(KEY);
  try {
    const raw = JSON.parse(text);
    S = raw && raw.version ? migrate(raw) : freshState();
  } catch {
    // Never silently overwrite data we couldn't read: park it under a side key first.
    if (text) storage.setItem(KEY + ".unreadable-" + Date.now(), text);
    S = freshState();
  }
  return S;
}

let persistRequested = false;
export function save(storage = globalThis.localStorage){
  storage.setItem(KEY, JSON.stringify(S));
  if (!persistRequested && globalThis.navigator?.storage?.persist) {
    persistRequested = true;
    navigator.storage.persist().catch(() => {});
  }
}

/* ---------- lookups ---------- */
export const countryById = id => S.countries.find(c => c.id === id);
export const catById     = id => S.categories.find(c => c.id === id);
export const subById     = (cat, id) => cat ? cat.subs.find(s => s.id === id) : null;
export const currentCountry = () => countryById(S.settings.currentCountryId);
