/* Wallet tab: cash on hand per currency, plus ATM withdrawals, exchanges and cash counts.
   None of these count as spending — only ATM fees do, and they're logged as expenses. */

import { el, modal, toast } from "../dom.js";
import { S, save, uid, currentCountry } from "../state.js";
import { fmtUSD, fmtLocal, fmtDay, fmtClock } from "../format.js";
import { dayOf, timeOf, offsetAt } from "../time.js";
import { parseAmount } from "../parse.js";
import { render } from "../router.js";
import { walletRows, totalUSD, balanceOf, countAdjustment, withdrawalRate, exchangeRate, feeCategory, describe } from "../wallet.js";
import { currencyField, currencyChoices, rateText } from "./money.js";

const now = () => { const d = new Date(); return { ts: d.toISOString(), tz: offsetAt(d) }; };
const localCode = () => currentCountry()?.currency || "USD";

export function renderWallet(view){
  const rows = walletRows(S);

  /* --- balances --- */
  const card = el("div", { class:"card" },
    el("h2", {}, "Cash on hand", rows.length ? el("span", { class:"hint" }, "≈ " + fmtUSD(totalUSD(S))) : ""));
  if (!rows.length) {
    card.appendChild(el("p", { class:"hint" },
      "Nothing tracked yet. Log an ATM withdrawal, or count the cash you're already carrying (dollars from home count too)."));
  }
  for (const r of rows) {
    const neg = r.amount < 0;
    card.appendChild(el("div", { class:"li wallet-row" + (r.amount === 0 ? " empty-cur" : "") },
      el("div", { class:"code" }, r.currency),
      el("div", { class:"mid" },
        el("div", { class:"t1 num" + (neg ? " neg" : "") }, fmtLocal(r.amount, r.currency)),
        el("div", { class:"t2" }, neg
          ? "Below zero — some cash wasn't tracked. Count it to fix."
          : r.currency === "USD" ? "home currency" : "≈ " + fmtUSD(r.usd))),
      el("button", { class:"iconbtn", onclick:() => openCount(r.currency) }, "count")));
  }
  view.appendChild(card);

  /* --- actions --- */
  view.appendChild(el("div", { class:"wallet-actions" },
    el("button", { class:"btn small", onclick:() => openWithdraw() }, "🏧 ATM withdrawal"),
    el("button", { class:"btn small", onclick:() => openExchange() }, "💱 Exchange"),
    el("button", { class:"btn small ghost", onclick:() => openCount() }, "🧮 Count cash")));

  /* --- movements --- */
  if (S.cash.length) {
    const list = el("div", { class:"card" }, el("h2", {}, "Cash movements"));
    for (const m of [...S.cash].sort((a, b) => b.ts.localeCompare(a.ts))) list.appendChild(movementRow(m));
    view.appendChild(list);
  }
  view.appendChild(el("p", { class:"hint", style:"text-align:center;padding:4px 0 10px" },
    "Withdrawals and exchanges aren't spending. Cash expenses come out of these balances; card expenses don't."));
}

function signed(amount, code){ return (amount > 0 ? "+" : "") + fmtLocal(amount, code); }

function movementRow(m){
  const icon = { withdraw:"🏧", exchange:"💱", adjust:"🧮" }[m.kind];
  let detail, amounts;
  if (m.kind === "withdraw") {
    detail = [m.fee ? `fee ${fmtLocal(m.fee, m.currency)}` : null,
              m.chargedUSD ? `card charged ${fmtUSD(m.chargedUSD)}` : null];
    amounts = [signed(m.amount, m.currency)];
  } else if (m.kind === "exchange") {
    detail = [];
    amounts = [signed(m.toAmount, m.to), signed(-m.fromAmount, m.from)];
  } else {
    detail = [`counted ${fmtLocal(m.counted, m.currency)}`];
    amounts = [signed(m.amount, m.currency)];
  }
  const when = fmtDay(dayOf(m)) + " · " + fmtClock(timeOf(m));
  return el("div", { class:"exp", onclick:() => openMovement(m) },
    el("span", { class:"e" }, icon),
    el("div", { class:"mid" },
      el("div", { class:"t1" }, describe(m)),
      el("div", { class:"t2" }, [...detail, when].filter(Boolean).join(" · "))),
    el("div", { class:"amt" }, amounts.map((a, i) => el("div", { class: i ? "a2" : "a1" }, a))));
}

function openMovement(m){
  modal((sheet, close) => {
    const fee = m.feeExpenseId && S.expenses.find(e => e.id === m.feeExpenseId);
    sheet.append(el("h2", {}, describe(m)), movementRow(m),
      el("p", { class:"hint", style:"margin:10px 0" },
        "To change it, delete it and log it again." + (fee ? " Deleting also removes its ATM fee expense." : "")),
      el("button", { class:"btn ghost", style:"color:var(--critical)", onclick:() => {
        S.cash = S.cash.filter(x => x.id !== m.id);
        if (fee) S.expenses = S.expenses.filter(e => e.id !== fee.id);
        save(); close(); render(); toast("Deleted");
      }}, "Delete this movement"));
  });
}

/* ---------- ATM withdrawal ---------- */
function openWithdraw(){
  modal((sheet, close) => {
    const cur = currencyField({ id:"atm-cur", choices: currencyChoices(localCode()), value: localCode(),
      onChange: update });
    const amountIn = el("input", { class:"txt", type:"text", id:"atm-amount", inputmode:"decimal", autocomplete:"off", placeholder:"e.g. 1.000.000" });
    const feeIn = el("input", { class:"txt", type:"text", id:"atm-fee", inputmode:"decimal", autocomplete:"off", placeholder:"optional" });
    const chargedIn = el("input", { class:"txt", type:"text", id:"atm-charged", inputmode:"decimal", autocomplete:"off", placeholder:"optional — from your bank app" });
    const useRate = el("input", { type:"checkbox", id:"atm-use-rate", checked:"" });
    const rateBox = el("div", { class:"rate-box" });
    [amountIn, feeIn, chargedIn].forEach(i => i.addEventListener("input", update));

    function values(){
      const code = cur.currency;
      return { code,
        amount: parseAmount(amountIn.value, code),
        fee: feeIn.value.trim() ? parseAmount(feeIn.value, code) : 0,
        charged: chargedIn.value.trim() ? parseAmount(chargedIn.value) : 0 };
    }
    function update(){
      const { code, amount, fee, charged } = values();
      const real = withdrawalRate(amount, fee, charged);
      rateBox.replaceChildren();
      if (!real || code === "USD") return;
      const current = S.rates[code];
      rateBox.append(
        el("div", {}, "You got ", el("b", {}, rateText(real, code)),
          current ? ` (the app uses ${rateText(current, code)})` : ""),
        el("label", { class:"check" }, useRate, ` Use this as the ${code} rate from now on`));
    }

    sheet.append(el("h2", {}, "ATM withdrawal"),
      el("label", { class:"f" }, "Currency"), cur.node,
      el("label", { class:"f", for:"atm-amount" }, "Cash you got"), amountIn,
      el("label", { class:"f", for:"atm-fee" }, "ATM fee, if the machine charged one"), feeIn,
      el("p", { class:"hint", style:"margin-top:4px" }, "The fee is logged as an expense (Misc · Fees, paid by card)."),
      el("label", { class:"f", for:"atm-charged" }, "Charged to your card, in USD"), chargedIn,
      rateBox, el("div", { class:"section-gap" }),
      el("button", { class:"btn", onclick:() => {
        const { code, amount, fee, charged } = values();
        const real = withdrawalRate(amount, fee, charged);
        const money = cur.read({ fallbackRate: real });
        if (money.error) { toast(money.error); return; }
        if (!(amount > 0)) { toast("Enter how much cash you got"); return; }
        if (!(fee >= 0) || !(charged >= 0)) { toast("Check the fee and card amounts"); return; }
        if (fee > 0 && !currentCountry()) { toast("Add the country you're in first, so the fee can be logged"); return; }
        if (money.isNew || (real && useRate.checked && code !== "USD")) S.rates[code] = real && useRate.checked ? real : money.perUSD;
        const t = now();
        const m = { id:uid(), ...t, kind:"withdraw", currency:code, amount };
        if (charged) m.chargedUSD = charged;
        if (fee > 0) {
          const { catId, subId } = feeCategory(S);
          const rate = S.rates[code];
          const e = { id:uid(), ...t, amount:fee, currency:code, perUSD:rate, usd:fee / rate,
            countryId: currentCountry()?.id, catId, subId, note:"ATM fee", paidWith:"card" };
          S.expenses.push(e);
          m.fee = fee; m.feeExpenseId = e.id;
        }
        S.cash.push(m);
        save(); close(); render();
        toast(`+${fmtLocal(amount, code)} in your pocket`);
      }}, "Save withdrawal"));
    update();
  });
}

/* ---------- exchange ---------- */
function openExchange(){
  modal((sheet, close) => {
    const carried = walletRows(S).filter(r => r.amount > 0).map(r => r.currency);
    const fromDefault = carried.find(c => c !== localCode()) || "USD";
    const from = currencyField({ id:"ex-from", choices: currencyChoices(fromDefault), value: fromDefault, onChange: update });
    const to = currencyField({ id:"ex-to", choices: currencyChoices(localCode()), value: localCode() === fromDefault ? "USD" : localCode(), onChange: update });
    const gaveIn = el("input", { class:"txt", type:"text", id:"ex-gave", inputmode:"decimal", autocomplete:"off" });
    const gotIn = el("input", { class:"txt", type:"text", id:"ex-got", inputmode:"decimal", autocomplete:"off" });
    const useRate = el("input", { type:"checkbox", id:"ex-use-rate", checked:"" });
    const info = el("div", { class:"rate-box" });
    [gaveIn, gotIn].forEach(i => i.addEventListener("input", update));

    const vals = () => ({ from: from.currency, to: to.currency,
      fromAmount: parseAmount(gaveIn.value, from.currency), toAmount: parseAmount(gotIn.value, to.currency) });
    function update(){
      const v = vals();
      info.replaceChildren();
      if (v.from && v.from === v.to) { info.append("Pick two different currencies."); return; }
      if (v.from && v.fromAmount > 0) {
        const have = balanceOf(S, v.from);
        if (v.fromAmount > have) info.append(el("div", { class:"warn-text" },
          `You only have ${fmtLocal(have, v.from)} tracked — the balance will go below zero.`));
      }
      const got = exchangeRate(S.rates, v);
      if (!got) return;
      const current = S.rates[got.currency];
      info.append(
        el("div", {}, "You got ", el("b", {}, rateText(got.perUSD, got.currency)),
          current ? ` (the app uses ${rateText(current, got.currency)})` : ""),
        el("label", { class:"check" }, useRate, ` Use this as the ${got.currency} rate from now on`));
    }

    sheet.append(el("h2", {}, "Exchange"),
      el("label", { class:"f" }, "You gave"), from.node, gaveIn,
      el("label", { class:"f" }, "You got"), to.node, gotIn,
      info, el("div", { class:"section-gap" }),
      el("button", { class:"btn", onclick:() => {
        const v = vals();
        if (!/^[A-Z]{3}$/.test(v.from) || !/^[A-Z]{3}$/.test(v.to)) { toast("Pick both currencies"); return; }
        if (v.from === v.to) { toast("Pick two different currencies"); return; }
        if (!(v.fromAmount > 0) || !(v.toAmount > 0)) { toast("Enter both amounts"); return; }
        const got = exchangeRate(S.rates, v);
        const fromMoney = from.read({ fallbackRate: got?.currency === v.from ? got.perUSD : undefined });
        const toMoney = to.read({ fallbackRate: got?.currency === v.to ? got.perUSD : undefined });
        if (fromMoney.error) { toast(fromMoney.error); return; }
        if (toMoney.error) { toast(toMoney.error); return; }
        if (fromMoney.isNew) S.rates[v.from] = fromMoney.perUSD;
        if (toMoney.isNew) S.rates[v.to] = toMoney.perUSD;
        if (got && useRate.checked) S.rates[got.currency] = got.perUSD;
        S.cash.push({ id:uid(), ...now(), kind:"exchange", ...v });
        save(); close(); render();
        toast(`Exchanged ${fmtLocal(v.fromAmount, v.from)} → ${fmtLocal(v.toAmount, v.to)}`);
      }}, "Save exchange"));
    update();
  });
}

/* ---------- count cash ---------- */
function openCount(code){
  modal((sheet, close) => {
    const start = code || localCode();
    const cur = currencyField({ id:"count-cur", choices: currencyChoices(start), value: start, onChange: update });
    const countIn = el("input", { class:"txt", type:"text", id:"count-amount", inputmode:"decimal", autocomplete:"off", placeholder:"what's actually in your pocket" });
    const info = el("div", { class:"rate-box" });
    countIn.addEventListener("input", update);

    function update(){
      info.replaceChildren();
      const c = cur.currency;
      if (!/^[A-Z]{3}$/.test(c || "")) return;
      const have = balanceOf(S, c);
      const counted = parseAmount(countIn.value, c);
      info.append(el("div", {}, `The app thinks you have ${fmtLocal(have, c)}.`));
      if (counted >= 0) {
        const delta = countAdjustment(S, c, counted);
        info.append(el("div", {}, delta === 0 ? "That matches — nothing to correct."
          : `This records a correction of ${signed(delta, c)}.`));
      }
    }

    sheet.append(el("h2", {}, "Count cash"),
      el("label", { class:"f" }, "Currency"), cur.node,
      el("label", { class:"f", for:"count-amount" }, "How much do you have?"), countIn,
      info, el("div", { class:"section-gap" }),
      el("button", { class:"btn", onclick:() => {
        const money = cur.read();
        if (money.error) { toast(money.error); return; }
        const counted = parseAmount(countIn.value, money.currency);
        if (!(counted >= 0)) { toast("Enter how much you counted (0 is fine)"); return; }
        const delta = countAdjustment(S, money.currency, counted);
        if (money.isNew) S.rates[money.currency] = money.perUSD;
        if (delta === 0 && !money.isNew) { close(); toast("All square — nothing to correct"); return; }
        S.cash.push({ id:uid(), ...now(), kind:"adjust", currency:money.currency, amount:delta, counted });
        save(); close(); render();
        toast(`${money.currency} balance set to ${fmtLocal(counted, money.currency)}`);
      }}, "Save count"));
    update();
  });
}
