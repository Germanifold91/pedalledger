/* Cash wallet: how much of each currency is in your pocket.
   Pure functions over the state — no DOM — so it's all unit-testable.

   state.cash holds movements of cash that are NOT spending:
     { kind:"withdraw", currency, amount, fee?, chargedUSD?, feeExpenseId? }   ATM → pocket
     { kind:"exchange", from, fromAmount, to, toAmount }                        pocket → pocket
     { kind:"adjust",   currency, amount, counted }                             "I counted my cash"
   Every movement also has id, ts, tz like an expense.
   Expenses paid in cash (paidWith:"cash") take money out of the pocket. */

const EPS = 1e-9;
const tidy = x => { const r = Math.round(x * 1e6) / 1e6; return Math.abs(r) < EPS ? 0 : r; };

/**
 * Map currency → cash on hand.
 * A currency is tracked from its first cash movement (withdrawal, exchange or count) on;
 * cash expenses before that, or in currencies never tracked, don't touch the wallet.
 * So someone who never opens the Wallet tab never sees negative balances.
 */
export function balances(state){
  const b = new Map();
  // currency → first movement time, to the minute (the Log form records whole minutes,
  // so a purchase in the same minute as a withdrawal still counts)
  const since = new Map();
  const minute = ts => typeof ts === "string" ? ts.slice(0, 16) : "";
  const track = (cur, ts) => { const t = minute(ts); if (!since.has(cur) || t < since.get(cur)) since.set(cur, t); };
  const add = (cur, v) => b.set(cur, (b.get(cur) || 0) + v);
  for (const m of state.cash) {
    if (m.kind === "withdraw") { track(m.currency, m.ts); add(m.currency, m.amount); }
    else if (m.kind === "exchange") { track(m.from, m.ts); track(m.to, m.ts); add(m.from, -m.fromAmount); add(m.to, m.toAmount); }
    else if (m.kind === "adjust") { track(m.currency, m.ts); add(m.currency, m.amount); }
  }
  for (const e of state.expenses)
    if (e.paidWith === "cash" && since.has(e.currency) && minute(e.ts) >= since.get(e.currency)) add(e.currency, -e.amount);
  for (const [k, v] of b) b.set(k, tidy(v));
  return b;
}

export const balanceOf = (state, cur) => balances(state).get(cur) || 0;

/** Currencies in the wallet, biggest USD value first; empty ones last. */
export function walletRows(state){
  return [...balances(state)].map(([currency, amount]) => ({
    currency, amount, usd: state.rates[currency] ? amount / state.rates[currency] : 0,
  })).sort((a, b) => (b.amount !== 0) - (a.amount !== 0) || b.usd - a.usd);
}

export const totalUSD = state => walletRows(state).reduce((a, r) => a + r.usd, 0);

/** The movement that makes the balance equal what you actually counted. */
export function countAdjustment(state, currency, counted){
  return tidy(counted - balanceOf(state, currency));
}

/**
 * Rate actually obtained at an ATM, in local units per USD:
 * (cash received + ATM fee) ÷ amount charged to the card in USD.
 */
export function withdrawalRate(amount, fee, chargedUSD){
  if (!(chargedUSD > 0) || !(amount > 0)) return null;
  return (amount + (fee > 0 ? fee : 0)) / chargedUSD;
}

/**
 * Rate obtained at an exchange, expressed for whichever side isn't USD.
 * Returns { currency, perUSD } or null if neither side has a known rate.
 *   gave 100 USD, got 1,250,000 UZS → { currency:"UZS", perUSD:12500 }
 *   gave 50 EUR,  got 600,000 UZS   → UZS rate from the EUR rate
 */
export function exchangeRate(rates, { from, fromAmount, to, toAmount }){
  if (!(fromAmount > 0) || !(toAmount > 0) || from === to) return null;
  if (rates[from] > 0 && to !== "USD") return { currency: to, perUSD: toAmount / (fromAmount / rates[from]) };
  if (rates[to] > 0 && from !== "USD") return { currency: from, perUSD: fromAmount / (toAmount / rates[to]) };
  return null;
}

/** Where ATM fees get filed: a "Fees" subcategory if there is one, else Misc, else the first category. */
export function feeCategory(state){
  const live = state.categories.filter(c => !c.archived);
  for (const c of live) {
    const sub = c.subs.find(s => !s.archived && /^fees?$/i.test(s.name));
    if (sub) return { catId: c.id, subId: sub.id };
  }
  const misc = live.find(c => /^misc/i.test(c.name));
  return { catId: (misc || live[0] || state.categories[0])?.id, subId: null };
}

/** Human description of a movement, for lists. */
export function describe(m){
  if (m.kind === "withdraw") return "ATM withdrawal";
  if (m.kind === "exchange") return `Exchanged ${m.from} → ${m.to}`;
  return "Counted cash";
}
