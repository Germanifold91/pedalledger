/* Money inputs shared by the Log form, the expense editor and the Wallet sheets:
   a currency chooser (with a rate field for currencies the app doesn't know yet)
   and a cash / card toggle. */

import { el } from "../dom.js";
import { S } from "../state.js";
import { fmtNum } from "../format.js";
import { parseAmount } from "../parse.js";
import { walletRows } from "../wallet.js";

const COMMON = ["USD", "EUR"];

/** Currencies worth a one-tap chip: the given ones, then whatever you're carrying, then USD/EUR. */
export function currencyChoices(...first){
  const carried = walletRows(S).filter(r => r.amount > 0).map(r => r.currency);
  return [...new Set([...first.filter(Boolean), ...carried, ...COMMON])];
}

/**
 * Currency chips + "Other…" code input + rate input when the currency is new.
 *   choices:  codes shown as chips
 *   value:    initial code
 *   onChange: called with the code whenever it changes
 * read() → { currency, perUSD, isNew } or { error }
 */
export function currencyField({ choices, value, onChange = () => {}, id = "cur" }){
  let cur = value;
  const wrap = el("div", { class:"money-cur" });
  const chips = el("div", { class:"chips", role:"radiogroup", "aria-label":"Currency" });
  const codeIn = el("input", { class:"txt", type:"text", id:id + "-code", maxlength:"3", placeholder:"e.g. KZT",
    autocomplete:"off", style:"text-transform:uppercase", "aria-label":"Currency code" });
  const otherRow = el("div", { class:"money-row" }, codeIn);
  const rateIn = el("input", { class:"txt", type:"text", id:id + "-rate", inputmode:"decimal",
    autocomplete:"off", placeholder:"e.g. 470" });
  const rateLbl = el("label", { class:"f", for:id + "-rate" });
  const rateRow = el("div", {}, rateLbl, rateIn);
  let otherOpen = !choices.includes(cur);
  if (otherOpen) codeIn.value = cur || "";

  const known = code => S.rates[code] > 0;

  function paint(){
    const list = choices.includes(cur) || otherOpen ? choices : [...choices, cur];
    chips.replaceChildren(
      ...list.map(code => el("button", { type:"button", class:"pill" + (!otherOpen && code === cur ? " active" : ""),
        role:"radio", "aria-checked": String(!otherOpen && code === cur),
        onclick:() => { otherOpen = false; set(code); } }, code)),
      el("button", { type:"button", class:"pill" + (otherOpen ? " active" : ""),
        onclick:() => { otherOpen = true; codeIn.value = ""; set(""); codeIn.focus(); } }, "Other…"));
    otherRow.hidden = !otherOpen;
    const needsRate = /^[A-Z]{3}$/.test(cur) && !known(cur);
    rateRow.hidden = !needsRate;
    rateLbl.textContent = `New currency — how many ${cur} for 1 USD?`;
  }
  function set(code){ cur = code; paint(); onChange(cur); }
  codeIn.addEventListener("input", () => set(codeIn.value.toUpperCase().trim()));

  paint();
  wrap.append(chips, otherRow, rateRow);

  return {
    node: wrap,
    get currency(){ return cur; },
    /** Rate to use: the known one, else what was typed, else a fallback (e.g. an ATM's real rate). */
    read({ fallbackRate } = {}){
      if (!/^[A-Z]{3}$/.test(cur)) return { error:"Pick a currency (3-letter code, e.g. KZT)" };
      if (known(cur)) return { currency:cur, perUSD:S.rates[cur], isNew:false };
      const r = parseAmount(rateIn.value);
      if (r > 0) return { currency:cur, perUSD:r, isNew:true };
      if (fallbackRate > 0) return { currency:cur, perUSD:fallbackRate, isNew:true };
      return { error:`Enter how many ${cur} you get for 1 USD` };
    },
  };
}

/** 💵 Cash / 💳 Card. */
export function paidWithToggle({ value, onChange = () => {} }){
  let v = value;
  const node = el("div", { class:"chips", role:"radiogroup", "aria-label":"Paid with" });
  function paint(){
    node.replaceChildren(...[["cash","💵 Cash"], ["card","💳 Card"]].map(([k, label]) =>
      el("button", { type:"button", class:"pill" + (v === k ? " active" : ""), role:"radio",
        "aria-checked": String(v === k), onclick:() => { v = k; paint(); onChange(v); } }, label)));
  }
  paint();
  return { node, get value(){ return v; } };
}

export const rateText = (perUSD, code) => `1 USD = ${fmtNum(+perUSD.toPrecision(6))} ${code}`;

/** "One-off" switch: big, rare costs kept out of daily averages and trends. */
export function oneOffToggle({ value = false, onChange = () => {} } = {}){
  let v = value;
  const btn = el("button", { type:"button", class:"pill", "aria-pressed":"false",
    onclick:() => { v = !v; paint(); onChange(v); } }, "★ One-off");
  const hint = el("span", { class:"hint" }, "visa, flight, big repair — kept out of daily averages");
  function paint(){
    btn.classList.toggle("active", v);
    btn.setAttribute("aria-pressed", String(v));
  }
  paint();
  return { node: el("div", { class:"oneoff-row" }, btn, hint), get value(){ return v; } };
}
