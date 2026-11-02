/* Log tab: today-vs-target meter, the new-expense form, and today's entries. */

import { el, toast } from "../dom.js";
import { S, save, uid, catById, currentCountry } from "../state.js";
import { fmtUSD, fmtLocal } from "../format.js";
import { dayOf, todayKey, nowWallClock, fromWallClock, offsetAt } from "../time.js";
import { parseAmount } from "../parse.js";
import { sumUSD } from "../stats.js";
import { render, go } from "../router.js";
import { categoryPicker } from "./picker.js";
import { expenseRow } from "./history.js";
import { openCountryEditor } from "./settings.js";
import { currencyField, currencyChoices, paidWithToggle, oneOffToggle, rateText } from "./money.js";
import { balances } from "../wallet.js";
import { backupStatus, backupMessage } from "../safety.js";
import { backupNow, importButton } from "../backup.js";

// selections survive re-renders (e.g. switching tabs mid-entry).
// currency null = the current country's currency.
const draft = { catId:null, subId:null, currency:null };

export function renderLog(view){
  const cc = currentCountry();

  const status = backupStatus(S);
  if (status.nag) {
    view.appendChild(el("div", { class:"banner" },
      el("div", { class:"mid" }, "⛑️ " + backupMessage(status)),
      el("button", { class:"btn small", onclick: backupNow }, "Back up now")
    ));
  }

  if (!cc) {
    view.appendChild(el("div", { class:"card" },
      el("h2", {}, "Welcome to PedalLedger"),
      el("p", { class:"hint", style:"margin-bottom:12px" },
        "Add the country you're riding in first — its currency, a rough exchange rate, and your daily budget. Everything else flows from that."),
      el("button", { class:"btn", onclick:() => openCountryEditor(null) }, "＋ Add your first country"),
      S.expenses.length ? "" : el("div", { class:"restore-hint" },
        el("span", {}, "New phone? Restoring from a backup?"),
        importButton({ label:"Restore a backup file", cls:"linkbtn" }))
    ));
    return;
  }

  const today = todayKey();
  const todays = S.expenses.filter(e => dayOf(e) === today);
  const todaysOneOffs = sumUSD(todays.filter(e => e.oneOff));
  view.appendChild(meterCard(sumUSD(todays) - todaysOneOffs, cc.dailyTargetUSD, todaysOneOffs));

  // ---- entry form ----
  const amountIn = el("input", { type:"text", id:"amount", inputmode:"decimal", placeholder:"0",
    autocomplete:"off", oninput:updatePreview, "aria-label":"Amount" });
  const curLabel = el("span", { class:"cur" });
  const preview = el("div", { class:"usd-preview" });
  const cashLine = el("div", { class:"cash-line" });

  const curField = currencyField({
    id:"log-cur",
    choices: currencyChoices(cc.currency),
    value: draft.currency || cc.currency,
    onChange: code => { draft.currency = code === cc.currency ? null : code; updatePreview(); },
  });
  const paid = paidWithToggle({
    value: S.settings.lastPaidWith || "cash",
    onChange: () => updatePreview(),
  });
  const oneOff = oneOffToggle();

  function updatePreview(){
    const code = curField.currency;
    curLabel.textContent = code || "—";
    amountIn.setAttribute("aria-label", "Amount in " + (code || "local currency"));
    const a = parseAmount(amountIn.value, code);
    const r = curField.read();
    // echo back how the number was read, so "50.000" visibly means fifty thousand
    if (!amountIn.value.trim()) preview.textContent = "";
    else if (!(isFinite(a) && a > 0)) preview.textContent = "Can't read that amount";
    else if (r.error) preview.textContent = fmtLocal(a, code);
    else preview.textContent = code === "USD" ? fmtUSD(a)
      : `${fmtLocal(a, code)} ≈ ${fmtUSD(a / r.perUSD)} · ${rateText(r.perUSD, code)}`;

    // cash on hand, only when paying cash in a currency we've tracked
    cashLine.replaceChildren();
    cashLine.className = "cash-line";
    if (paid.value === "cash" && /^[A-Z]{3}$/.test(code || "")) {
      const tracked = balances(S);
      if (tracked.has(code)) {
        const have = tracked.get(code);
        const short = isFinite(a) && a > have;
        cashLine.className = "cash-line" + (short ? " short" : "");
        cashLine.append(`💵 ${fmtLocal(have, code)} in your pocket`,
          short ? " — that's more than you have. " : "",
          short ? el("button", { type:"button", class:"linkbtn", onclick:() => go("wallet") }, "Count cash") : "");
      }
    }
  }

  const picker = categoryPicker({
    categories: S.categories.filter(c => !c.archived),
    catId: draft.catId, subId: draft.subId,
    onChange: v => Object.assign(draft, v),
  });
  Object.assign(draft, picker.value());

  const noteIn = el("input", { class:"txt", type:"text", id:"note", placeholder:"Note (optional)", autocomplete:"off" });
  const whenIn = el("input", { class:"txt", type:"datetime-local", id:"when", value:nowWallClock() });

  const saveBtn = el("button", { class:"btn", onclick:() => {
    const money = curField.read();
    if (money.error) { toast(money.error); return; }
    const a = parseAmount(amountIn.value, money.currency);
    if (!isFinite(a) || a <= 0) { toast("Enter an amount"); amountIn.focus(); return; }
    if (!draft.catId) { toast("Pick a category"); return; }
    if (money.isNew) S.rates[money.currency] = money.perUSD;
    const tz = offsetAt();
    const ts = whenIn.value ? fromWallClock(whenIn.value, tz) : new Date().toISOString();
    S.expenses.push({
      id: uid(), ts, tz, amount:a, currency:money.currency, perUSD:money.perUSD,
      usd: a / money.perUSD, countryId: cc.id, catId: draft.catId, subId: draft.subId,
      note: noteIn.value.trim(), paidWith: paid.value,
      ...(oneOff.value ? { oneOff: true } : {}),
    });
    S.settings.lastPaidWith = paid.value;
    save();
    const cat = catById(draft.catId);
    toast(`Saved ${fmtLocal(a, money.currency)} · ${cat.emoji} ${cat.name}` + (paid.value === "card" ? " · card" : ""));
    draft.catId = null; draft.subId = null; draft.currency = null;
    render();
  }}, "Save expense");

  view.appendChild(el("div", { class:"card" },
    el("h2", {}, "New expense"),
    el("div", { class:"amount-wrap" }, amountIn, curLabel),
    preview,
    curField.node,
    el("label", { class:"f" }, "Paid with"), paid.node,
    cashLine,
    oneOff.node,
    el("label", { class:"f" }, "Category"), ...picker.nodes,
    el("label", { class:"f" }, "Note"), noteIn,
    el("label", { class:"f" }, "When"), whenIn,
    el("div", { class:"section-gap" }), saveBtn
  ));
  updatePreview();

  if (todays.length) {
    view.appendChild(el("div", { class:"card" },
      el("h2", {}, `Today · ${todays.length} expense${todays.length > 1 ? "s" : ""}`),
      todays.sort((a, b) => b.ts.localeCompare(a.ts)).map(expenseRow)
    ));
  }
}

function meterCard(spent, target, oneOffs = 0){
  const pct = target > 0 ? spent / target : 0;
  const fillColor = pct > 1 ? "var(--critical)" : pct >= .9 ? "var(--warning)" : "var(--s1)";
  const status =
    pct > 1   ? el("div", { class:"status-note over" }, `▲ ${fmtUSD(spent - target)} over today's target`) :
    pct >= .9 ? el("div", { class:"status-note warn" }, `◔ ${fmtUSD(target - spent)} left — close to target`) :
                el("div", { class:"status-note under" }, `▼ ${fmtUSD(target - spent)} left today`);
  return el("div", { class:"card" },
    el("div", { class:"meter-row" },
      el("div", { class:"big" }, fmtUSD(spent), el("small", {}, ` of ${fmtUSD(target)} today`)),
      el("div", { class:"hint" }, Math.round(pct * 100) + "%")
    ),
    el("div", { class:"meter" }, el("div", { style:`width:${Math.min(100, pct * 100)}%;background:${fillColor}` })),
    target > 0 ? status : el("div", { class:"status-note" }, "No daily target set for this country."),
    oneOffs > 0 ? el("div", { class:"status-note" }, `★ plus ${fmtUSD(oneOffs)} in one-offs today, not counted against the target`) : ""
  );
}
