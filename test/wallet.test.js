import { test } from "node:test";
import assert from "node:assert/strict";
import { balances, balanceOf, countAdjustment, withdrawalRate, exchangeRate, feeCategory, walletRows } from "../js/wallet.js";

const base = () => ({
  rates: { USD:1, UZS:12500, KGS:87, EUR:0.92 },
  categories: [
    { id:"food", name:"Food", archived:false, subs:[] },
    { id:"misc", name:"Misc", archived:false, subs:[{ id:"sim", name:"SIM & data", archived:false }, { id:"fees", name:"Fees", archived:false }] },
  ],
  expenses: [],
  cash: [],
});
const exp = (amount, currency, paidWith) => ({ amount, currency, paidWith });

test("withdrawals add cash, cash expenses spend it, card expenses don't touch it", () => {
  const s = base();
  s.cash.push({ kind:"withdraw", currency:"UZS", amount:1_000_000 });
  s.expenses.push(exp(85_000, "UZS", "cash"), exp(40_000, "UZS", "card"), exp(15_000, "UZS", "cash"));
  assert.equal(balanceOf(s, "UZS"), 900_000);
});

test("an exchange moves money between currencies", () => {
  const s = base();
  s.cash.push({ kind:"adjust", currency:"USD", amount:300 });                       // brought from home
  s.cash.push({ kind:"exchange", from:"USD", fromAmount:100, to:"UZS", toAmount:1_250_000 });
  const b = balances(s);
  assert.equal(b.get("USD"), 200);
  assert.equal(b.get("UZS"), 1_250_000);
});

test("counting cash produces the correction that matches the pocket", () => {
  const s = base();
  s.cash.push({ kind:"withdraw", currency:"KGS", amount:5000 });
  s.expenses.push(exp(1200, "KGS", "cash"));
  const delta = countAdjustment(s, "KGS", 3500);
  assert.equal(delta, -300);                                                        // 300 som went somewhere
  s.cash.push({ kind:"adjust", currency:"KGS", amount:delta, counted:3500 });
  assert.equal(balanceOf(s, "KGS"), 3500);
});

test("floating-point dust doesn't leave phantom balances", () => {
  const s = base();
  s.cash.push({ kind:"withdraw", currency:"EUR", amount:0.3 });
  s.expenses.push(exp(0.1, "EUR", "cash"), exp(0.2, "EUR", "cash"));
  assert.equal(balanceOf(s, "EUR"), 0);
});

test("wallet rows put real money first, biggest USD value first", () => {
  const s = base();
  s.cash.push({ kind:"withdraw", currency:"UZS", amount:625_000 });                 // $50
  s.cash.push({ kind:"adjust", currency:"USD", amount:120 });                       // $120
  s.cash.push({ kind:"withdraw", currency:"KGS", amount:870 });
  s.expenses.push(exp(870, "KGS", "cash"));                                         // spent to zero
  assert.deepEqual(walletRows(s).map(r => r.currency), ["USD", "UZS", "KGS"]);
});

test("ATM rate includes the fee the machine added", () => {
  assert.equal(withdrawalRate(1_000_000, 25_000, 82), 12_500);
  assert.equal(withdrawalRate(1_000_000, 0, 0), null);
});

test("exchange rate is expressed for the non-USD side", () => {
  assert.deepEqual(exchangeRate({ USD:1 }, { from:"USD", fromAmount:100, to:"UZS", toAmount:1_250_000 }),
    { currency:"UZS", perUSD:12_500 });
  assert.deepEqual(exchangeRate({ USD:1 }, { from:"UZS", fromAmount:1_300_000, to:"USD", toAmount:100 }),
    { currency:"UZS", perUSD:13_000 });
  // EUR → UZS uses the known EUR rate: 46 EUR = $50 → 625,000/50
  assert.deepEqual(exchangeRate({ USD:1, EUR:0.92 }, { from:"EUR", fromAmount:46, to:"UZS", toAmount:625_000 }),
    { currency:"UZS", perUSD:12_500 });
  assert.equal(exchangeRate({ USD:1 }, { from:"KGS", fromAmount:1, to:"UZS", toAmount:1 }), null);
});

test("ATM fees are filed under a Fees subcategory when one exists", () => {
  assert.deepEqual(feeCategory(base()), { catId:"misc", subId:"fees" });
  const s = base(); s.categories[1].subs[1].archived = true;
  assert.deepEqual(feeCategory(s), { catId:"misc", subId:null });
});

test("cash is only tracked from a currency's first withdrawal, exchange or count", () => {
  const s = base();
  // paid cash before ever touching the wallet, and in a currency never tracked
  s.expenses.push({ amount:500, currency:"KGS", paidWith:"cash", ts:"2027-06-01T08:00:00.000Z" });
  s.expenses.push({ amount:9, currency:"EUR", paidWith:"cash", ts:"2027-06-01T09:00:00.000Z" });
  s.cash.push({ kind:"withdraw", currency:"KGS", amount:5000, ts:"2027-06-02T10:00:00.000Z" });
  s.expenses.push({ amount:700, currency:"KGS", paidWith:"cash", ts:"2027-06-02T12:00:00.000Z" });
  const b = balances(s);
  assert.equal(b.get("KGS"), 4300);
  assert.equal(b.has("EUR"), false);
});

test("a purchase logged in the same minute as the withdrawal counts", () => {
  const s = base();
  s.cash.push({ kind:"withdraw", currency:"UZS", amount:100_000, ts:"2027-07-01T10:05:42.123Z" });
  s.expenses.push({ amount:30_000, currency:"UZS", paidWith:"cash", ts:"2027-07-01T10:05:00.000Z" });
  assert.equal(balanceOf(s, "UZS"), 70_000);
});
