# PedalLedger 🚲

Offline-first expense tracker for a bicycle trip. One HTML file, no backend, no
accounts. Data lives in the phone's browser storage; export to CSV/JSON for
backup and post-trip analysis.

## What it does

- **Log** — amount in the local currency, category + subcategory, note,
  timestamp. Live USD preview. Today-vs-target meter.
- **Countries** — each has a currency, a manual exchange rate (local units per
  1 USD) and a daily budget target in USD. One tap to switch when you cross a
  border. The rate is **snapshotted per expense**, so editing a rate later never
  silently rewrites history (you're asked whether to recalculate).
- **Categories** — 8 defaults, fully editable: add, rename, archive; same for
  subcategories. Archived ones keep labeling old expenses.
- **Stats** — date-range filter (whole trip / 30d / 7d / today), total, average
  per day, pace vs target, daily-spend chart with the target line, category
  breakdown with tap-to-drill subcategories, per-country average vs target.
  Every chart has a table view.
- **Backup** — CSV / JSON export, JSON import, share sheet on mobile. The app
  nags after 3 days without a backup. **Take the nag seriously** — the data
  only exists on the phone.

## Running it locally

```sh
cd bike-trip-expenses
python3 -m http.server 8471
# open http://localhost:8471
```

## Getting it on your phone (recommended: host it)

The PWA bits (home-screen install + offline) need HTTPS hosting. Any static
host works and takes ~2 minutes:

1. **GitHub Pages** — push this folder to a repo, enable Pages. Free, stable URL.
2. **Netlify Drop** (app.netlify.com/drop) — drag the folder into the browser, done.

Then on the phone, open the URL once while online:

- **Android/Chrome**: menu → *Add to Home screen* → Install.
- **iPhone/Safari**: Share → *Add to Home Screen*.

After that first visit it works fully offline; updates to the hosted files are
picked up automatically next time you open it with signal.

## Data & analysis

Everything is stored under the `pedalledger.v1` key in localStorage as one JSON
document. The CSV export has one row per expense:

```
date,time,amount,currency,local_per_usd,usd,country,category,subcategory,note
```

Post-trip in pandas:

```python
import pandas as pd
df = pd.read_csv("pedalledger-2026-XX-XX.csv", parse_dates=["date"])
df.groupby("category").usd.sum().sort_values(ascending=False)
df.groupby("date").usd.sum().plot()
```

## Files

| file | purpose |
|---|---|
| `index.html` | the whole app (UI, storage, charts) |
| `sw.js` | service worker — network-first, cache fallback for offline |
| `manifest.webmanifest` | PWA manifest (home-screen install) |

If you edit `index.html`, bump `CACHE` in `sw.js` (v2 → v3 …) so installed
phones refresh promptly.
