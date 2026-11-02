/* PedalLedger — offline-first trip expense tracker.
   Entry point: load state, wire the tabs and header, register the service worker. */

import { S, load, currentCountry } from "./state.js";
import { dailySnapshot } from "./snapshots.js";
import { registerViews, onRenderHeader, render, go } from "./router.js";
import { hideTip } from "./dom.js";
import { renderLog } from "./views/log.js";
import { renderStats } from "./views/stats.js";
import { renderHistory } from "./views/history.js";
import { renderSettings, openCountrySwitcher } from "./views/settings.js";
import { renderWallet } from "./views/wallet.js";

load();
dailySnapshot(S);   // first open of the day keeps a copy (in the background)

registerViews({ log:renderLog, stats:renderStats, history:renderHistory, wallet:renderWallet, settings:renderSettings });

const pill = document.getElementById("countryPill");
onRenderHeader(() => {
  const cc = currentCountry();
  pill.textContent = cc ? `📍 ${cc.name} · ${cc.currency}` : "＋ Add country";
});
pill.addEventListener("click", openCountrySwitcher);

document.querySelectorAll("nav.tabs button").forEach(b =>
  b.addEventListener("click", () => go(b.dataset.tab)));

addEventListener("scroll", hideTip, { passive:true });
// charts bake computed colors at render time — repaint if the OS theme flips mid-session
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
