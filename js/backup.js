/* Backup: CSV/JSON download, share sheet, and JSON restore.
   Restores go through migrate() + validate() before anything is replaced. */

import { el, toast } from "./dom.js";
import { S, save, setState, migrate, validate } from "./state.js";
import { buildCSV } from "./csv.js";
import { todayKey } from "./time.js";
import { render } from "./router.js";

function stampBackup(){ S.settings.lastBackup = new Date().toISOString(); save(); }

function downloadBlob(name, type, content){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function exportFile(kind){
  const stamp = todayKey();
  if (kind === "csv") downloadBlob(`pedalledger-${stamp}.csv`, "text/csv", buildCSV(S));
  else downloadBlob(`pedalledger-backup-${stamp}.json`, "application/json", JSON.stringify(S, null, 1));
  stampBackup(); render(); toast("Exported — now get it off this phone 😉");
}

export async function shareBackup(){
  const stamp = todayKey();
  const file = new File([JSON.stringify(S, null, 1)], `pedalledger-backup-${stamp}.json`,
    { type:"application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files:[file] })) {
      await navigator.share({ files:[file], title:"PedalLedger backup" });
    } else {
      await navigator.share({ title:"PedalLedger backup", text:buildCSV(S) });
    }
    stampBackup(); render(); toast("Backup shared");
  } catch { /* user cancelled */ }
}

/** Parse + upgrade + check a backup file's text. Returns {data} or {error}. */
export function readBackup(text){
  let data;
  try { data = JSON.parse(text); } catch { return { error:"That file isn't valid JSON." }; }
  if (!data || typeof data !== "object" ||
      !["expenses", "countries", "categories"].every(k => Array.isArray(data[k])))
    return { error:"That file doesn't look like a PedalLedger backup." };
  try { data = migrate(data); } catch (err) { return { error: err.message }; }
  const problems = validate(data);
  if (problems.length) return { error:`That backup has problems: ${problems.slice(0, 3).join("; ")}` +
    (problems.length > 3 ? ` (+${problems.length - 3} more)` : "") };
  return { data };
}

export function importButton(){
  const input = el("input", { type:"file", accept:".json,application/json", style:"display:none",
    onchange: async (ev) => {
      const f = ev.target.files[0];
      ev.target.value = "";
      if (!f) return;
      const { data, error } = readBackup(await f.text());
      if (error) { alert(error); return; }
      if (!confirm(`Replace current data with this backup?\n(${data.expenses.length} expenses, ${data.countries.length} countries)`)) return;
      setState(data); save(); render(); toast("Backup restored");
    }});
  return el("span", {}, input,
    el("button", { class:"btn small ghost", onclick:() => input.click() }, "Import JSON"));
}
