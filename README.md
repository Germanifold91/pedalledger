# PedalLedger 🚲

Offline-first expense tracker for a bicycle trip. No backend, no accounts, no build
step. Data lives in the phone's browser storage; export to CSV/JSON for backup and
post-trip analysis.

## What it does

- **Log** — amount in the local currency, category + subcategory, note,
  timestamp. Live USD preview that also echoes back how the amount was read
  (`50.000` → 50,000 COP). Today-vs-target meter.
- **Countries** — each has a currency, a manual exchange rate (local units per
  1 USD) and a daily budget target in USD. One tap to switch when you cross a
  border. The rate is **snapshotted per expense**, so editing a rate later never
  silently rewrites history (you're asked whether to recalculate).
- **Time zones** — each expense remembers the UTC offset where it was logged, so
  it stays on the right day after you've ridden into another zone.
- **Categories** — 8 defaults, fully editable: add, rename, archive; same for
  subcategories. Archived ones keep labeling old expenses.
- **Stats** — date-range filter (whole trip / 30d / 7d / today), total, average
  per day, pace vs target, daily-spend chart with the target line, category
  breakdown with tap-to-drill subcategories, per-country average vs target.
  Every chart has a table view.
- **Backup** — CSV / JSON export, JSON import (checked before it replaces
  anything), share sheet on mobile. The app nags after 3 days without a backup.
  **Take the nag seriously** — the data only exists on the phone.

### Typing amounts

Write numbers the way you normally do; the app works out which mark is which:

| you type | it reads |
|---|---|
| `50.000` / `150,000` / `1 000` | thousands (50000, 150000, 1000) |
| `12,50` / `12.5` | decimals (12.5) |
| `1.234,56` / `1,234.56` | 1234.56 |

The preview under the amount always shows what will be saved.

## Project layout

```
index.html            markup shell — loads css/app.css and js/app.js
css/app.css           all styles + light/dark design tokens
js/
  app.js              entry point: load state, wire tabs, register service worker
  router.js           tab switching; views register themselves here
  state.js            the data model, schema version, migrations, validation, storage
  time.js             how expenses map to days across time zones
  parse.js            reading typed amounts ("50.000", "1,234.56", …)
  format.js           money / date display
  stats.js            pure number-crunching for the Stats tab
  csv.js              CSV export
  backup.js           export / share / import UI
  charts.js           SVG charts
  dom.js              el() element builder, toast, modal, tooltip
  views/              one module per tab (log, stats, history, settings) + picker
test/                 unit tests (node:test, no dependencies)
sw.js                 service worker — offline support
manifest.webmanifest  PWA manifest (home-screen install)
```

Rule of thumb: anything that computes something lives in a module with **no DOM
access** (`state`, `time`, `parse`, `format`, `stats`, `csv`) so it can be tested.
Views only build UI and call into those.

### Changing the data shape

The saved document carries a `version`. To change its shape:

1. Bump `SCHEMA_VERSION` in `js/state.js`.
2. Add a `MIGRATIONS[oldVersion]` function that upgrades a document in place.
3. Add a test in `test/state.test.js` that migrates an old document.

Old data on the phone and old backup files then keep loading.

## Development

Needs Node 20+ for tests and Python (or any static server) to run it.

```sh
npm test          # runs all tests, in four time zones
npm run serve     # http://localhost:8471
```

ES modules don't load from `file://`, so always open it through a server.

If you add or rename a file under `js/` or `css/`, add it to `ASSETS` in `sw.js`
(a test fails if you forget) and bump `CACHE` so installed phones refresh.

## Deploying

`.github/workflows/ci.yml` runs the tests on every push and pull request, and
publishes to GitHub Pages when `main` passes. One-time setup: repo **Settings →
Pages → Source: GitHub Actions**.

Then on the phone, open the Pages URL once while online:

- **Android/Chrome**: menu → *Add to Home screen* → Install.
- **iPhone/Safari**: Share → *Add to Home Screen*.

After that first visit it works fully offline. On a weak connection it waits at
most 3 seconds for fresh files before opening the cached app.

## Data & analysis

Everything is stored under the `pedalledger.v1` localStorage key as one JSON
document. The CSV export has one row per expense; `date` and `time` are local to
where it was logged:

```
date,time,amount,currency,local_per_usd,usd,country,category,subcategory,note,utc_offset
```

Post-trip in pandas:

```python
import pandas as pd
df = pd.read_csv("pedalledger-2027-XX-XX.csv", parse_dates=["date"])
df.groupby("category").usd.sum().sort_values(ascending=False)
df.groupby("date").usd.sum().plot()
```
