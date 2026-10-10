# VVB Sales

A small phone app for logging beat sales and tracking them against a monthly goal.

- Goal ring with % of your monthly goal and the daily pace needed to hit it
- Today / month / average / all-time totals
- 30-day sales chart and top beats for the month
- Milestone notifications at 25 / 50 / 75 / 100% of the goal
- CSV export, plus backup / restore (JSON)
- Works offline once installed; all data stays on the device

## Put it on your Android phone

1. In this repo go to **Settings → Pages**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`, and save.
2. After a minute the app is live at `https://vicevinnybeats.github.io/payment-provider/`.
3. Open that link in **Chrome** on your phone → menu (⋮) → **Add to Home screen** / **Install app**.
4. Open it from the home-screen icon, tap ⚙ to set your goal and turn on notifications.

Data lives in the browser on your phone, so use **Settings → Backup** now and then.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```
