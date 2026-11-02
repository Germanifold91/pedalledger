/* History tab: every expense grouped by day, tap one to edit or delete it. */

import { el, modal, toast } from "../dom.js";
import { S, save, catById, subById, countryById } from "../state.js";
import { fmtUSD, fmtLocal, fmtDay, fmtClock } from "../format.js";
import { dayOf, timeOf, offsetAt, wallClock, fromWallClock, fmtOffset } from "../time.js";
import { parseAmount } from "../parse.js";
import { sumUSD } from "../stats.js";
import { render } from "../router.js";
import { categoryPicker } from "./picker.js";
import { currencyField, currencyChoices, paidWithToggle, oneOffToggle } from "./money.js";

export function expenseRow(e){
  const cat = catById(e.catId);
  const sub = subById(cat, e.subId);
  const cc = countryById(e.countryId);
  // show the zone only when it differs from where the phone is now
  const clock = fmtClock(timeOf(e)) + (e.tz !== offsetAt() ? ` (${fmtOffset(e.tz)})` : "");
  return el("div", { class:"exp", onclick:() => openExpenseEditor(e) },
    el("span", { class:"e" }, cat ? cat.emoji : "❓"),
    el("div", { class:"mid" },
      el("div", { class:"t1" }, (cat ? cat.name : "Unknown") + (sub ? " · " + sub.name : ""),
        e.oneOff ? el("span", { class:"badge oneoff" }, "one-off") : ""),
      el("div", { class:"t2" }, [e.paidWith === "card" ? "💳" : null, e.note, cc ? cc.name : null, clock]
        .filter(Boolean).join(" · "))
    ),
    el("div", { class:"amt" },
      el("div", { class:"a1" }, fmtLocal(e.amount, e.currency)),
      e.currency !== "USD" ? el("div", { class:"a2" }, fmtUSD(e.usd)) : null
    )
  );
}

export function renderHistory(view){
  if (!S.expenses.length) {
    view.appendChild(el("div", { class:"empty" }, "No expenses yet. Log the first one from the ✏️ tab."));
    return;
  }
  const byDay = new Map();
  for (const e of S.expenses) {
    const k = dayOf(e);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  for (const dk of [...byDay.keys()].sort().reverse()) {
    const list = byDay.get(dk).sort((a, b) => b.ts.localeCompare(a.ts));
    view.appendChild(el("div", { class:"day-h" },
      el("span", {}, fmtDay(dk)), el("b", {}, fmtUSD(sumUSD(list)))));   // the day's true total, one-offs included
    list.forEach(e => view.appendChild(expenseRow(e)));
  }
}

export function openExpenseEditor(e){
  modal((sheet, close) => {
    sheet.appendChild(el("h2", {}, "Edit expense"));

    const initialAmount = String(e.amount);
    const amountIn = el("input", { class:"txt", type:"text", inputmode:"decimal",
      value:initialAmount, autocomplete:"off" });
    const countrySel = el("select", { class:"txt" },
      S.countries.map(c => el("option", { value:c.id, selected: c.id === e.countryId ? "" : null },
        `${c.name} (${c.currency})`)));

    const curField = currencyField({
      id:"edit-cur", choices: currencyChoices(e.currency), value: e.currency,
      onChange: code => { amountLbl.textContent = `Amount (${code || "—"})`; },
    });
    const paid = paidWithToggle({ value: e.paidWith || "card" });
    const oneOff = oneOffToggle({ value: !!e.oneOff });
    const amountLbl = el("label", { class:"f" }, `Amount (${e.currency})`);

    const picker = categoryPicker({
      categories: S.categories.filter(c => !c.archived || c.id === e.catId),
      catId: e.catId, subId: e.subId, keepSubId: e.subId,
    });

    const noteIn = el("input", { class:"txt", type:"text", value:e.note || "", autocomplete:"off" });
    // edited in the wall-clock time of the place it was logged
    const whenIn = el("input", { class:"txt", type:"datetime-local", value:wallClock(e.ts, e.tz) });

    sheet.append(
      amountLbl, amountIn, curField.node,
      el("label", { class:"f" }, "Paid with"), paid.node,
      oneOff.node,
      el("label", { class:"f" }, "Country"), countrySel,
      el("label", { class:"f" }, "Category"), ...picker.nodes,
      el("label", { class:"f" }, "Note"), noteIn,
      el("label", { class:"f" }, `When (local time, ${fmtOffset(e.tz)})`), whenIn,
      el("div", { class:"section-gap" }),
    );

    sheet.appendChild(el("button", { class:"btn", onclick:() => {
      const money = curField.read();
      if (money.error) { toast(money.error); return; }
      // an untouched field keeps its exact stored value (no re-parsing ambiguity)
      const a = amountIn.value === initialAmount ? e.amount : parseAmount(amountIn.value, money.currency);
      if (!isFinite(a) || a <= 0) { toast("Enter a valid amount"); return; }
      const cc = countryById(countrySel.value);
      if (!cc) { toast("Pick a country"); return; }
      const { catId, subId } = picker.value();
      if (!catId) { toast("Pick a category"); return; }
      if (money.isNew) S.rates[money.currency] = money.perUSD;
      e.amount = a;
      e.countryId = cc.id;
      // a different currency takes today's rate for it; the same currency keeps its snapshot
      if (money.currency !== e.currency) { e.currency = money.currency; e.perUSD = money.perUSD; }
      e.usd = e.amount / e.perUSD;
      e.paidWith = paid.value;
      if (oneOff.value) e.oneOff = true; else delete e.oneOff;
      e.catId = catId; e.subId = subId;
      e.note = noteIn.value.trim();
      if (whenIn.value) e.ts = fromWallClock(whenIn.value, e.tz);
      save(); close(); render(); toast("Updated");
    }}, "Save changes"));
    sheet.appendChild(el("div", { class:"section-gap" }));
    sheet.appendChild(el("button", { class:"btn ghost", style:"color:var(--critical)", onclick:() => {
      if (!confirm("Delete this expense?")) return;
      S.expenses = S.expenses.filter(x => x.id !== e.id);
      save(); close(); render(); toast("Deleted");
    }}, "Delete expense"));
  });
}
