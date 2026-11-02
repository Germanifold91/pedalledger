# PedalLedger 🚲

Offline-first expense tracker for a bicycle trip. No backend, no accounts, no build
step. Data lives in the phone's browser storage; export to CSV/JSON for backup and
post-trip analysis.

## What it does

- **Log** — amount in the local currency, category + subcategory, note,
  timestamp. Live USD preview that also echoes back how the amount was read
  (`50.000` → 50,000 COP). Today-vs-target meter.
- **Countries** — each has a currency and a daily budget target in USD. One tap
  to switch when you cross a border.
- **Currencies & rates** — one exchange rate per currency (local units per
  1 USD), shared by every country that uses it, so Germany and France share one
  EUR rate. Pay any expense in any currency: the country's own is the default,
  with one-tap chips for USD, EUR and whatever you're carrying, and "Other…" for
  a new one. The rate is **snapshotted per expense**, so editing a rate later
  never silently rewrites history (you choose whether to re-value).
- **Wallet** — cash on hand per currency. Log ATM withdrawals (the fee becomes a
  card expense; the amount charged to your card shows the rate you really got),
  exchanges (shows the rate you got and can adopt it), and cash counts that
  correct the balance. Each expense is marked cash or card; only cash comes out
  of the wallet. A currency is tracked from its first withdrawal, exchange or
  count, so if you never use the Wallet nothing goes negative.
- **Time zones** — each expense remembers the UTC offset where it was logged, so
  it stays on the right day after you've ridden into another zone.
- **Categories** — 8 defaults, fully editable: add, rename, archive; same for
  subcategories. Archived ones keep labeling old expenses.
- **Stats** — date-range filter (whole trip / 30d / 7d / today), total, average
  per day, pace vs target, daily-spend chart with the target line, category
  breakdown with tap-to-drill subcategories, per-country average vs target.
  Every chart has a table view.
- **Backup** — one tap ("Back up now") opens the share sheet with a JSON
  backup named with the date and time. The Log screen nags once there are
  changes that aren't backed up and either 2 days have passed or 15+ changes
  piled up. A fresh install offers "Restore a backup file" right on the welcome
  card. CSV export is for spreadsheets; restoring needs the JSON.
- **Snapshots** — the first time the app opens each day it keeps a copy on the
  phone (last 14 days), plus one before every restore or import (last 5).
  Settings lists them with a Restore button. They undo mistakes; they don't
  help if the phone is lost.

## Keeping the data safe on an iPhone

The data lives only on the phone, so the backup routine is the safety net:

1. **Back up now** → **Save to Files** → iCloud Drive → a `PedalLedger` folder.
   iCloud uploads it by itself the next time there's signal. Each backup has its
   own date-and-time name, so nothing gets overwritten.
2. Now and then, **Back up now** → **Mail** to yourself as a second copy.
3. **Never delete the PedalLedger icon from the home screen without a fresh
   backup.** On iPhone that deletes the app's data too, and reinstalling doesn't
   bring it back.

**Rehearse it once before leaving:** log a few expenses, back up to iCloud
Drive, delete the home-screen icon, reinstall from the Pages URL, and use
"Restore a backup file" on the welcome card. Five minutes, and you know it works.

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
  wallet.js           cash balances, real ATM/exchange rates
  safety.js           backup reminder rules, backup file names, snapshot retention
  snapshots.js        on-phone snapshots in IndexedDB
  csv.js              CSV export
  backup.js           export / share / import UI
  charts.js           SVG charts
  dom.js              el() element builder, toast, modal, tooltip
  views/              one module per tab (log, stats, history, wallet, settings)
                      + shared inputs: picker (categories), money (currency, cash/card)
test/                 unit tests (node:test, no dependencies)
sw.js                 service worker — offline support
manifest.webmanifest  PWA manifest (home-screen install)
```

Rule of thumb: anything that computes something lives in a module with **no DOM
access** (`state`, `time`, `parse`, `format`, `stats`, `wallet`, `safety`, `csv`) so it can be tested.
Views only build UI and call into those.

### Changing the data shape

The saved document carries a `version`. To change its shape:

1. Bump `SCHEMA_VERSION` in `js/state.js`.
2. Add a `MIGRATIONS[oldVersion]` function that upgrades a document in place.
3. Add a test in `test/state.test.js` that migrates an old document.

Old data on the phone and old backup files then keep loading. On the first load
after an upgrade, the untouched original is kept under `pedalledger.v1.pre-vN`.

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
date,time,amount,currency,local_per_usd,usd,country,category,subcategory,note,utc_offset,paid_with
```

Cash movements (withdrawals, exchanges, counts) aren't spending, so they're not
in the CSV; they're in the JSON backup under `cash`.

Post-trip in pandas:

```python
import pandas as pd
df = pd.read_csv("pedalledger-2027-XX-XX.csv", parse_dates=["date"])
df.groupby("category").usd.sum().sort_values(ascending=False)
df.groupby("date").usd.sum().plot()
```
