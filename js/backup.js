/* Backup: share sheet (→ iCloud Drive / Mail), CSV/JSON download, and restore.
   Restores go through migrate() + validate() first, and the current data is
   snapshotted before anything is replaced. */

import { el, toast, confirmSheet, noticeSheet } from "./dom.js";
import { S, save, setState, migrate, validate } from "./state.js";
import { buildCSV } from "./csv.js";
import { backupFileName } from "./safety.js";
import { takeSnapshot } from "./snapshots.js";
import { render } from "./router.js";

/** Mark the current data as backed up (the save below brings rev up to backupRev). */
function stampBackup(){
  S.settings.lastBackup = new Date().toISOString();
  S.settings.backupRev = (S.settings.rev || 0) + 1;
  save();
}

function downloadBlob(name, type, content){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const backupJSON = () => JSON.stringify(S, null, 1);

export function exportFile(kind){
  if (kind === "csv") {
    downloadBlob(backupFileName(new Date(), "csv").replace("-backup", ""), "text/csv", buildCSV(S));
    toast("CSV exported (for spreadsheets — restore needs the JSON backup)");
    return;
  }
  downloadBlob(backupFileName(), "application/json", backupJSON());
  stampBackup(); render(); toast("Backup saved — now get it off this phone 😉");
}

export const canShareFiles = () => {
  try {
    return !!(navigator.canShare && navigator.canShare({ files:[new File(["{}"], "x.json", { type:"application/json" })] }));
  } catch { return false; }
};

/** One-tap backup: the share sheet (Save to Files → iCloud Drive, Mail…), or a download where sharing files isn't possible. */
export async function backupNow(){
  if (!canShareFiles()) { exportFile("json"); return; }
  const file = new File([backupJSON()], backupFileName(), { type:"application/json" });
  try {
    await navigator.share({ files:[file], title:"PedalLedger backup" });
    stampBackup(); render();
    toast("Backup handed off — check it landed in iCloud Drive");
  } catch (err) {
    if (err?.name !== "AbortError") toast("Couldn't open the share sheet — try ⬇ JSON backup in Settings");
  }
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

const hasData = () => S.expenses.length > 0 || S.cash.length > 0 || S.countries.length > 0;
const summary = d => `${d.expenses.length} expense${d.expenses.length === 1 ? "" : "s"}, ` +
  `${d.countries.length} countr${d.countries.length === 1 ? "y" : "ies"}, ${d.cash.length} cash movement${d.cash.length === 1 ? "" : "s"}`;

/**
 * Replace everything with `data`. The current data is snapshotted first (if there is any),
 * so a wrong restore can be undone from Settings → Snapshots.
 */
export async function replaceData(data, { reason, message }){
  if (hasData()) await takeSnapshot(S, reason);
  setState(data);
  // what's on the phone now matches a file that exists, so it counts as backed up
  S.settings.lastBackup = new Date().toISOString();
  S.settings.backupRev = (S.settings.rev || 0) + 1;
  save(); render(); toast(message);
}

/** A button that picks a backup file and restores it. */
export function importButton({ label = "Import JSON", cls = "btn small ghost" } = {}){
  const input = el("input", { type:"file", accept:".json,application/json", style:"display:none",
    onchange: async (ev) => {
      const f = ev.target.files[0];
      ev.target.value = "";
      if (!f) return;
      const { data, error } = readBackup(await f.text());
      if (error) { noticeSheet("Can't restore that file", error); return; }
      const restore = () => replaceData(data, { reason:"before import", message:"Backup restored" });
      if (!hasData()) { await restore(); return; }
      confirmSheet({
        title: "Replace your data with this backup?",
        body: [`The backup has ${summary(data)}.`,
               `What's on the phone now (${summary(S)}) is kept as a snapshot, so you can undo this from Settings.`],
        action: "Replace my data", danger: true, onConfirm: restore,
      });
    }});
  return el("span", {}, input, el("button", { class: cls, onclick:() => input.click() }, label));
}
