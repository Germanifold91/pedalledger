/* Log tab: today-vs-target meter, the new-expense form, and today's entries. */

import { el, toast } from "../dom.js";
import { S, save, uid, catById, currentCountry } from "../state.js";
import { fmtUSD, fmtLocal, fmtNum } from "../format.js";
import { dayOf, todayKey, nowWallClock, fromWallClock, offsetAt } from "../time.js";
import { parseAmount } from "../parse.js";
import { sumUSD } from "../stats.js";
import { render, go } from "../router.js";
import { categoryPicker } from "./picker.js";
import { expenseRow } from "./history.js";
import { openCountryEditor } from "./settings.js";

// category selection survives re-renders (e.g. switching tabs mid-entry)
const draft = { catId:null, subId:null };

export function backupOverdueDays(now = Date.now()){
  if (!S.expenses.length) return 0;
  const since = S.settings.lastBackup
    || S.expenses.reduce((a, e) => e.ts < a ? e.ts : a, S.expenses[0].ts);
  return Math.floor((now - new Date(since)) / 864e5);
}

export function renderLog(view){
  const cc = currentCountry();

  const overdue = backupOverdueDays();
  if (overdue >= 3) {
    view.appendChild(el("div", { class:"banner" },
      el("div", { class:"mid" }, `⛑️ No backup in ${overdue} days. If the phone goes, un-exported expenses go with it.`),
      el("button", { class:"btn small", onclick:() => go("settings") }, "Back up")
    ));
  }

  if (!cc) {
    view.appendChild(el("div", { class:"card" },
      el("h2", {}, "Welcome to PedalLedger"),
      el("p", { class:"hint", style:"margin-bottom:12px" },
        "Add the country you're riding in first — its currency, a rough exchange rate, and your daily budget. Everything else flows from that."),
      el("button", { class:"btn", onclick:() => openCountryEditor(null) }, "＋ Add your first country")
    ));
    return;
  }

  const today = todayKey();
  const todays = S.expenses.filter(e => dayOf(e) === today);
  view.appendChild(meterCard(sumUSD(todays), cc.dailyTargetUSD));

  // ---- entry form ----
  const amountIn = el("input", { type:"text", inputmode:"decimal", placeholder:"0",
    autocomplete:"off", oninput:updatePreview, "aria-label":"Amount in " + cc.currency });
  const preview = el("div", { class:"usd-preview" });
  function updatePreview(){
    const a = parseAmount(amountIn.value, cc.currency);
    // echo back how the number was read, so "50.000" visibly means fifty thousand
    preview.textContent = (isFinite(a) && a > 0 && cc.perUSD > 0)
      ? `${fmtLocal(a, cc.currency)} ≈ ${fmtUSD(a / cc.perUSD)} · ${fmtNum(cc.perUSD)} ${cc.currency}/USD`
      : amountIn.value.trim() ? "Can't read that amount" : "";
  }

  const picker = categoryPicker({
    categories: S.categories.filter(c => !c.archived),
    catId: draft.catId, subId: draft.subId,
    onChange: v => Object.assign(draft, v),
  });
  Object.assign(draft, picker.value());

  const noteIn = el("input", { class:"txt", type:"text", placeholder:"Note (optional)", autocomplete:"off" });
  const whenIn = el("input", { class:"txt", type:"datetime-local", value:nowWallClock() });

  const saveBtn = el("button", { class:"btn", onclick:() => {
    const a = parseAmount(amountIn.value, cc.currency);
    if (!isFinite(a) || a <= 0) { toast("Enter an amount"); amountIn.focus(); return; }
    if (!draft.catId) { toast("Pick a category"); return; }
    if (!(cc.perUSD > 0)) { toast("This country has no exchange rate set"); return; }
    const tz = offsetAt();
    const ts = whenIn.value ? fromWallClock(whenIn.value, tz) : new Date().toISOString();
    S.expenses.push({
      id: uid(), ts, tz, amount:a, currency:cc.currency, perUSD:cc.perUSD,
      usd: a / cc.perUSD, countryId: cc.id, catId: draft.catId, subId: draft.subId,
      note: noteIn.value.trim()
    });
    save();
    const cat = catById(draft.catId);
    toast(`Saved ${fmtLocal(a, cc.currency)} · ${cat.emoji} ${cat.name}`);
    draft.catId = null; draft.subId = null;
    render();
  }}, "Save expense");

  view.appendChild(el("div", { class:"card" },
    el("h2", {}, "New expense"),
    el("div", { class:"amount-wrap" }, amountIn, el("span", { class:"cur" }, cc.currency)),
    preview,
    el("label", { class:"f" }, "Category"), ...picker.nodes,
    el("label", { class:"f" }, "Note"), noteIn,
    el("label", { class:"f" }, "When"), whenIn,
    el("div", { class:"section-gap" }), saveBtn
  ));

  if (todays.length) {
    view.appendChild(el("div", { class:"card" },
      el("h2", {}, `Today · ${todays.length} expense${todays.length > 1 ? "s" : ""}`),
      todays.sort((a, b) => b.ts.localeCompare(a.ts)).map(expenseRow)
    ));
  }
}

function meterCard(spent, target){
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
    target > 0 ? status : el("div", { class:"status-note" }, "No daily target set for this country.")
  );
}
