/* Tab router. Views register themselves here; anything can call render() or go(tab).
   Views import this module, never the other way round, so there are no import cycles. */

import { hideTip } from "./dom.js";

const views = {};
let tab = "log";
let header = () => {};

export const registerViews = map => Object.assign(views, map);
export const onRenderHeader = fn => { header = fn; };
export const currentTab = () => tab;

export function render(){
  document.querySelectorAll("nav.tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab));
  header();
  const view = document.getElementById("view");
  view.replaceChildren();
  hideTip();
  views[tab](view);
}

export function go(next){ tab = next; render(); }
