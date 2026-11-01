/* Settings tab plus the country / category editors and the country switcher. */

import { el, modal, toast } from "../dom.js";
import { S, save, setState, uid, freshState } from "../state.js";
import { fmtUSD, fmtNum } from "../format.js";
import { parseAmount } from "../parse.js";
import { render } from "../router.js";
import { exportFile, shareBackup, importButton } from "../backup.js";

export function renderSettings(view){
  /* countries */
  const cCard = el("div", { class:"card" }, el("h2", {}, "Countries",
    el("button", { class:"iconbtn", onclick:() => openCountryEditor(null) }, "＋ add")));
  if (!S.countries.length) cCard.appendChild(el("div", { class:"empty" }, "No countries yet."));
  for (const c of S.countries) {
    const isCur = c.id === S.settings.currentCountryId;
    cCard.appendChild(el("div", { class:"li" },
      el("div", { class:"mid" },
        el("div", { class:"t1" }, c.name + " ", isCur ? el("span", { class:"badge" }, "current") : ""),
        el("div", { class:"t2" }, `${c.currency} · ${fmtNum(c.perUSD)} per USD · target ${fmtUSD(c.dailyTargetUSD)}/day`)),
      !isCur ? el("button", { class:"iconbtn", onclick:() => {
        S.settings.currentCountryId = c.id; save(); render(); toast(`Now in ${c.name}`);
      }}, "set current") : "",
      el("button", { class:"iconbtn", onclick:() => openCountryEditor(c) }, "edit")
    ));
  }
  view.appendChild(cCard);

  /* categories */
  const catCard = el("div", { class:"card" }, el("h2", {}, "Categories",
    el("button", { class:"iconbtn", onclick:() => openCategoryEditor(null) }, "＋ add")));
  for (const c of S.categories) {
    catCard.appendChild(el("div", { class:"li", style: c.archived ? "opacity:.45" : "" },
      el("span", { style:"font-size:20px" }, c.emoji),
      el("div", { class:"mid" },
        el("div", { class:"t1" }, c.name + (c.archived ? " (archived)" : "")),
        el("div", { class:"t2" }, c.subs.filter(s => !s.archived).map(s => s.name).join(", ") || "no subcategories")),
      el("button", { class:"iconbtn", onclick:() => openCategoryEditor(c) }, "edit")
    ));
  }
  view.appendChild(catCard);

  /* backup & export */
  const lastB = S.settings.lastBackup
    ? new Date(S.settings.lastBackup).toLocaleDateString(undefined, { month:"short", day:"numeric" }) : "never";
  view.appendChild(el("div", { class:"card" },
    el("h2", {}, "Backup & export", el("span", { class:"hint" }, "last: " + lastB)),
    el("p", { class:"hint", style:"margin-bottom:10px" },
      "Data lives only on this phone. Export regularly — email it to yourself or drop it in cloud storage."),
    el("div", { class:"row" },
      el("button", { class:"btn small", onclick:() => exportFile("csv") }, "⬇ CSV"),
      el("button", { class:"btn small", onclick:() => exportFile("json") }, "⬇ JSON backup"),
      navigator.share ? el("button", { class:"btn small ghost", onclick:shareBackup }, "Share…") : "",
      importButton()
    )));

  /* danger zone */
  view.appendChild(el("div", { class:"card" },
    el("h2", {}, "Danger zone"),
    el("button", { class:"btn ghost", style:"color:var(--critical)", onclick:() => {
      if (!confirm("Erase ALL data — every expense, country and category?")) return;
      if (!confirm("Really erase everything? This cannot be undone unless you have a JSON backup.")) return;
      setState(freshState()); save(); render(); toast("All data erased");
    }}, "Erase all data")));

  view.appendChild(el("p", { class:"hint", style:"text-align:center;padding:0 0 12px" },
    "PedalLedger · offline-first · home currency USD"));
}

/* ---- country editor ---- */
export function openCountryEditor(c){
  modal((sheet, close) => {
    const isNew = !c;
    sheet.appendChild(el("h2", {}, isNew ? "Add country" : "Edit " + c.name));
    const nameIn = el("input", { class:"txt", type:"text", placeholder:"e.g. Colombia",
      value: c ? c.name : "", autocomplete:"off" });
    const curIn = el("input", { class:"txt", type:"text", placeholder:"e.g. COP",
      value: c ? c.currency : "", autocomplete:"off", maxlength:"3", style:"text-transform:uppercase" });
    const initialRate = c ? String(c.perUSD) : "";
    const initialTarget = c ? String(c.dailyTargetUSD) : "";
    const rateIn = el("input", { class:"txt", type:"text", inputmode:"decimal",
      placeholder:"e.g. 4150", value: initialRate, autocomplete:"off" });
    const targetIn = el("input", { class:"txt", type:"text", inputmode:"decimal",
      placeholder:"e.g. 50", value: initialTarget, autocomplete:"off" });
    const readRate = () => rateIn.value === initialRate && c ? c.perUSD : parseAmount(rateIn.value);
    const readTarget = () => targetIn.value === initialTarget && c ? c.dailyTargetUSD : parseAmount(targetIn.value);

    const rateHint = el("div", { class:"hint", style:"margin-top:4px" });
    function updHint(){
      const r = readRate(), code = curIn.value.toUpperCase().trim() || "local";
      rateHint.textContent = (isFinite(r) && r > 0)
        ? `1 USD = ${fmtNum(r)} ${code} → ${fmtNum(r)} ${code} logs as ${fmtUSD(1)}`
        : "How many units of the local currency for 1 US dollar? A rough rate is fine — update it any time.";
    }
    rateIn.addEventListener("input", updHint); curIn.addEventListener("input", updHint); updHint();

    sheet.append(
      el("label", { class:"f" }, "Country name"), nameIn,
      el("label", { class:"f" }, "Currency code"), curIn,
      el("label", { class:"f" }, "Exchange rate — local units per 1 USD"), rateIn, rateHint,
      el("label", { class:"f" }, "Daily budget target (USD)"), targetIn,
      el("div", { class:"section-gap" }),
    );

    sheet.appendChild(el("button", { class:"btn", onclick:() => {
      const name = nameIn.value.trim();
      const code = curIn.value.toUpperCase().trim();
      const rate = readRate();
      const target = readTarget();
      if (!name) { toast("Give the country a name"); return; }
      if (!/^[A-Z]{3}$/.test(code)) { toast("Currency code should be 3 letters (e.g. COP)"); return; }
      if (!isFinite(rate) || rate <= 0) { toast("Enter a valid exchange rate"); return; }
      if (!isFinite(target) || target < 0) { toast("Enter a valid daily target (0 is fine)"); return; }
      if (isNew) {
        const nc = { id:uid(), name, currency:code, perUSD:rate, dailyTargetUSD:target };
        S.countries.push(nc);
        S.settings.currentCountryId = nc.id;    // adding a country = you just arrived
        save(); close(); render(); toast(`${name} added — you're riding in ${name} now`);
      } else {
        const rateChanged = rate !== c.perUSD;
        c.name = name; c.currency = code; c.perUSD = rate; c.dailyTargetUSD = target;
        const affected = S.expenses.filter(e => e.countryId === c.id);
        if (rateChanged && affected.length &&
            confirm(`Rate changed. Recalculate the USD value of ${affected.length} existing ${name} expense${affected.length > 1 ? "s" : ""} with the new rate?\n\n(Cancel keeps them at the rate they were logged with.)`)) {
          for (const e of affected) { e.perUSD = rate; e.usd = e.amount / rate; }
        }
        save(); close(); render(); toast("Saved");
      }
    }}, isNew ? "Add country" : "Save"));

    if (!isNew) {
      const used = S.expenses.some(e => e.countryId === c.id);
      sheet.appendChild(el("div", { class:"section-gap" }));
      sheet.appendChild(el("button", { class:"btn ghost", style:"color:var(--critical)", onclick:() => {
        if (used) { toast("Country has expenses — it can't be deleted"); return; }
        if (!confirm(`Delete ${c.name}?`)) return;
        S.countries = S.countries.filter(x => x.id !== c.id);
        if (S.settings.currentCountryId === c.id)
          S.settings.currentCountryId = S.countries.length ? S.countries[0].id : null;
        save(); close(); render(); toast("Deleted");
      }}, used ? "Delete (blocked — has expenses)" : "Delete country"));
    }
  });
}

export function openCountrySwitcher(){
  if (!S.countries.length) { openCountryEditor(null); return; }
  modal((sheet, close) => {
    sheet.appendChild(el("h2", {}, "Where are you riding?"));
    for (const c of S.countries) {
      const isCur = c.id === S.settings.currentCountryId;
      sheet.appendChild(el("div", { class:"li", style:"cursor:pointer", onclick:() => {
        S.settings.currentCountryId = c.id; save(); close(); render(); toast(`Now in ${c.name}`);
      }},
        el("span", { style:"font-size:17px; width:22px" }, isCur ? "✓" : ""),
        el("div", { class:"mid" },
          el("div", { class:"t1" }, c.name),
          el("div", { class:"t2" }, `${c.currency} · target ${fmtUSD(c.dailyTargetUSD)}/day`))));
    }
    sheet.appendChild(el("div", { class:"section-gap" }));
    sheet.appendChild(el("button", { class:"btn ghost", onclick:() => { close(); openCountryEditor(null); } },
      "＋ Add a new country"));
  });
}

/* ---- category editor ---- */
export function openCategoryEditor(c){
  modal((sheet, close) => {
    const isNew = !c;
    sheet.appendChild(el("h2", {}, isNew ? "Add category" : "Edit category"));
    const emojiIn = el("input", { class:"txt", type:"text", value: c ? c.emoji : "",
      placeholder:"emoji, e.g. 🛶", maxlength:"4", style:"width:90px", autocomplete:"off" });
    const nameIn = el("input", { class:"txt", type:"text", value: c ? c.name : "",
      placeholder:"Category name", autocomplete:"off", style:"flex:1" });
    sheet.appendChild(el("label", { class:"f" }, "Icon & name"));
    sheet.appendChild(el("div", { class:"row" }, emojiIn, nameIn));

    const subList = el("div", {});
    const subs = c ? c.subs : [];
    function paintSubs(){
      subList.replaceChildren();
      if (!c) { subList.appendChild(el("p", { class:"hint" }, "Save the category first, then add subcategories.")); return; }
      if (!subs.length) subList.appendChild(el("p", { class:"hint" }, "No subcategories yet."));
      for (const s of subs) {
        subList.appendChild(el("div", { class:"li", style: s.archived ? "opacity:.45" : "" },
          el("div", { class:"mid" }, el("div", { class:"t1" }, s.name + (s.archived ? " (archived)" : ""))),
          el("button", { class:"iconbtn", onclick:() => {
            const nn = prompt("Rename subcategory", s.name);
            if (nn && nn.trim()) { s.name = nn.trim(); save(); paintSubs(); }
          }}, "rename"),
          el("button", { class:"iconbtn", onclick:() => {
            s.archived = !s.archived; save(); paintSubs();
          }}, s.archived ? "restore" : "archive")));
      }
    }
    sheet.appendChild(el("label", { class:"f" }, "Subcategories"));
    sheet.appendChild(subList); paintSubs();
    if (c) {
      const newSubIn = el("input", { class:"txt", type:"text", placeholder:"New subcategory",
        autocomplete:"off", style:"flex:1" });
      sheet.appendChild(el("div", { class:"row", style:"margin-top:8px" },
        newSubIn,
        el("button", { class:"btn small", onclick:() => {
          const v = newSubIn.value.trim();
          if (!v) return;
          subs.push({ id:uid(), name:v, archived:false });
          newSubIn.value = ""; save(); paintSubs();
        }}, "add")));
    }

    sheet.appendChild(el("div", { class:"section-gap" }));
    sheet.appendChild(el("button", { class:"btn", onclick:() => {
      const name = nameIn.value.trim();
      if (!name) { toast("Give it a name"); return; }
      const emoji = emojiIn.value.trim() || "🏷️";
      if (isNew) {
        S.categories.push({ id:uid(), name, emoji, archived:false, subs:[] });
        save(); close(); render(); toast(`${emoji} ${name} added — open it again to add subcategories`);
      } else {
        c.name = name; c.emoji = emoji;
        save(); close(); render(); toast("Saved");
      }
    }}, isNew ? "Add category" : "Save"));

    if (!isNew) {
      sheet.appendChild(el("div", { class:"section-gap" }));
      sheet.appendChild(el("button", { class:"btn ghost", onclick:() => {
        c.archived = !c.archived; save(); close(); render();
        toast(c.archived ? "Archived — old expenses keep the label" : "Restored");
      }}, c.archived ? "Restore category" : "Archive category"));
    }
  });
}
