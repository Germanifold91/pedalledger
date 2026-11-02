/* App state: one JSON document, persisted to localStorage.
   Shape changes go through migrate() so old data and old backups keep loading. */

import { offsetAt } from "./time.js";

export const KEY = "pedalledger.v1";   // storage key never changes; `version` inside does
export const SCHEMA_VERSION = 3;

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
    settings: { homeCurrency:"USD", currentCountryId:null, lastBackup:null, lastPaidWith:"cash" },
    rates: { USD: 1 },  // local units per 1 USD, one rate per currency
    countries: [],   // {id,name,currency,dailyTargetUSD}
    categories: DEFAULT_CATEGORIES.map(c => ({
      id: uid(), name:c.name, emoji:c.emoji, archived:false,
      subs: c.subs.map(s => ({ id: uid(), name:s, archived:false }))
    })),
    expenses: [],    // {id,ts,tz,amount,currency,perUSD,usd,countryId,catId,subId,note,paidWith}
    cash: [],        // cash movements, see wallet.js: withdraw | exchange | adjust
  };
}

/* ---------- migrations: version N → N+1 ---------- */
const MIGRATIONS = {
  // v2: each expense remembers the UTC offset where it was logged.
  // Old expenses get the offset this device had at that instant — the best guess available.
  1: (d, { offsetOf }) => {
    for (const e of d.expenses) if (typeof e.tz !== "number") e.tz = offsetOf(new Date(e.ts));
  },
  // v3: exchange rates belong to currencies (Germany and France share one EUR rate),
  // expenses record cash vs card, and there's a cash ledger.
  2: (d) => {
    const rates = { ...(d.rates || {}) };
    const cur = d.settings?.currentCountryId;
    // when two countries share a currency, the current country's rate wins
    const ordered = [...d.countries].sort((a, b) => (a.id === cur) - (b.id === cur));
    for (const c of ordered) if (c.perUSD > 0) rates[c.currency] = c.perUSD;
    rates.USD = 1;
    d.rates = rates;
    for (const c of d.countries) delete c.perUSD;
    for (const e of d.expenses) if (e.paidWith !== "cash" && e.paidWith !== "card") e.paidWith = "card";
    d.cash = Array.isArray(d.cash) ? d.cash : [];
  },
};

export function migrate(data, { offsetOf = offsetAt } = {}){
  const d = structuredClone(data);
  let v = Number(d.version) || 1;
  if (v > SCHEMA_VERSION) throw new Error("This backup is from a newer version of PedalLedger — update the app first.");
  while (v < SCHEMA_VERSION) { MIGRATIONS[v](d, { offsetOf }); v++; }
  d.version = SCHEMA_VERSION;
  d.settings = { homeCurrency:"USD", currentCountryId:null, lastBackup:null, lastPaidWith:"cash", ...d.settings };
  return d;
}

/* ---------- validation (used on import, before anything is replaced) ---------- */
export function validate(d){
  const problems = [];
  const isStr = v => typeof v === "string" && v.length > 0;
  const isPos = v => typeof v === "number" && Number.isFinite(v) && v > 0;
  if (!d || typeof d !== "object") return ["not a JSON object"];
  for (const k of ["expenses", "countries", "categories", "cash"])
    if (!Array.isArray(d[k])) problems.push(`missing "${k}" list`);
  if (!d.rates || typeof d.rates !== "object") problems.push(`missing exchange rates`);
  if (problems.length) return problems;

  const isCode = v => typeof v === "string" && /^[A-Z]{3}$/.test(v);
  for (const [code, r] of Object.entries(d.rates))
    if (!isCode(code) || !isPos(r)) problems.push(`exchange rate for ${code} is invalid`);
  if (d.rates.USD !== 1) problems.push(`USD rate must be 1`);
  const hasRate = code => isPos(d.rates[code]);

  const countryIds = new Set(), catIds = new Set();
  d.countries.forEach((c, i) => {
    if (!isStr(c?.id) || !isStr(c?.name) || !isCode(c?.currency) || !hasRate(c.currency))
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
    if (!isCode(e?.currency)) problems.push(`${where} has a bad currency`);
    if (e?.paidWith !== "cash" && e?.paidWith !== "card") problems.push(`${where} doesn't say cash or card`);
  });
  d.cash.forEach((m, i) => {
    const where = `cash movement #${i+1}`;
    if (!isStr(m?.id) || !isStr(m?.ts) || Number.isNaN(Date.parse(m.ts))) problems.push(`${where} is incomplete`);
    else if (m.kind === "withdraw") {
      if (!hasRate(m.currency) || !isPos(m.amount)) problems.push(`${where} has a bad amount or currency`);
    } else if (m.kind === "exchange") {
      if (!hasRate(m.from) || !hasRate(m.to) || !isPos(m.fromAmount) || !isPos(m.toAmount) || m.from === m.to)
        problems.push(`${where} has a bad amount or currency`);
    } else if (m.kind === "adjust") {
      if (!hasRate(m.currency) || !Number.isFinite(m.amount)) problems.push(`${where} has a bad amount or currency`);
    } else problems.push(`${where} has an unknown kind`);
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
    if (raw && raw.version && raw.version < SCHEMA_VERSION) {
      // keep the pre-upgrade copy once, then store the upgraded data
      // (a failed write here is harmless: the next load simply migrates again)
      try {
        const backupKey = `${KEY}.pre-v${SCHEMA_VERSION}`;
        if (!storage.getItem(backupKey)) storage.setItem(backupKey, text);
        storage.setItem(KEY, JSON.stringify(S));
      } catch { /* storage full — keep going with the in-memory upgrade */ }
    }
  } catch {
    // Never silently overwrite data we couldn't read: park it under a side key first.
    if (text) storage.setItem(KEY + ".unreadable-" + Date.now(), text);
    S = freshState();
  }
  return S;
}

let persistRequested = false;
export function save(storage = globalThis.localStorage){
  S.settings.rev = (S.settings.rev || 0) + 1;   // counts changes, for "N changes since your last backup"
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
/** Local units per 1 USD, or undefined if the currency has no rate yet. */
export const rateOf = code => S.rates[code];
