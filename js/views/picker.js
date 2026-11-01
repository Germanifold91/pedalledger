/* Category grid + subcategory chips, shared by the Log form and the expense editor. */

import { el } from "../dom.js";

/**
 * categories: the categories to offer (already filtered for archived as needed)
 * catId/subId: initial selection
 * keepSubId:  a subcategory to show even if archived (when editing an old expense)
 * onChange({catId, subId}) fires on every change
 */
export function categoryPicker({ categories, catId = null, subId = null, keepSubId = null, onChange = () => {} }){
  if (!categories.some(c => c.id === catId)) { catId = null; subId = null; }
  const grid = el("div", { class:"catgrid" });
  const subWrap = el("div", {});
  const emit = () => onChange({ catId, subId });

  function renderSubs(){
    subWrap.replaceChildren();
    const cat = categories.find(c => c.id === catId);
    const subs = cat ? cat.subs.filter(s => !s.archived || s.id === keepSubId) : [];
    if (!subs.some(s => s.id === subId)) subId = null;
    if (!subs.length) return;
    subWrap.appendChild(el("div", { class:"chips" },
      subs.map(s => el("button", { class:"pill" + (subId === s.id ? " active" : ""),
        onclick:() => { subId = subId === s.id ? null : s.id; renderSubs(); emit(); } }, s.name))));
  }
  function renderGrid(){
    grid.replaceChildren(...categories.map(c =>
      el("button", { class: c.id === catId ? "sel" : "", onclick:() => {
        catId = c.id; subId = null; renderGrid(); renderSubs(); emit();
      }}, el("span", { class:"e" }, c.emoji), c.name)));
  }
  renderGrid(); renderSubs();

  return {
    nodes: [grid, subWrap],
    value: () => ({ catId, subId }),
  };
}
