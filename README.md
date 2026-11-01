# Thumbnail A/B Click Study (AI vs. hand-photoshopped)

A zero-build static site: each visitor sees **10 pairs** of thumbnails (one AI-generated,
one hand-photoshopped per pair) and clicks the one they'd click on YouTube. Every click
is recorded with pair id, chosen variant, left/right position, session id, and timestamp.

Pair order and left/right placement are **randomized per visitor** (counterbalanced), so
position bias averages out. Arrow keys (←/→) also work.

## Run locally

```bash
cd thumbnail-ab-test
python3 -m http.server 8000     # or: npm run serve
# open http://localhost:8000
```

Votes will fail to save locally unless a backend is configured; that's fine for UI testing.

## Swap in your real thumbnails

Generate placeholders once (optional):

```bash
python3 tools/generate_placeholders.py
```

Then replace the 20 files in `thumbnails/` with your real images, keeping the naming
`p01_ai.jpg`, `p01_human.jpg`, … `p10_human.jpg` (or edit `data/pairs.js` to point at
your filenames). Thumbnails should be 16:9 (e.g. 1280×720).

## Pick a backend (one of three)

Set `backend` in `config.js`: `"sheets"`, `"netlify"` (default endpoints), or `"vercel"`.

### Option A — Google Sheets (easiest, no deploy of functions)

1. Create a Google Sheet, open **Extensions → Apps Script**, paste `backends/google-apps-script/code.gs`.
2. **Deploy → New deployment → Web app**: execute as *Me*, access *Anyone*. Copy the `/exec` URL.
3. Put that URL in `config.js` → `endpoints.sheets`, set `backend: "sheets"`.
4. Deploy the static files anywhere (Netlify Drop, Vercel, GitHub Pages, …).
5. Export the `Votes` sheet as CSV for analysis: `node analysis/analyze.js --sheets "<published CSV URL>"`.

### Option B — Netlify Functions + Netlify Blobs

1. Push this folder to a Git repo, **Add new site → Import from Git** on Netlify (or drag-drop the folder to Netlify Drop — but functions need Git import; use Drop only for Option A).
2. `netlify.toml` is already configured (`functions = backends/netlify/functions`). `npm install` happens automatically for the functions bundle (`@netlify/blobs` in `package.json`).
3. `backend` defaults to `"netlify"`; endpoints `/.netlify/functions/vote` and `/.netlify/functions/results` work out of the box.
4. Results: `https://<your-site>/.netlify/functions/results` → `node analysis/analyze.js --url <that URL>`.

### Option C — Vercel (current default in `config.js`)

1. In the Vercel project dashboard: **Storage → Create Database → Blob** (creates `BLOB_READ_WRITE_TOKEN` automatically for the project's functions).
2. Import the repo on Vercel. `api/vote.js` and `api/results.js` are auto-detected as
   serverless functions; `vercel.json` rewrites the `/.netlify/functions/*` paths to them.
3. `config.js` ships with `backend: "vercel"`, so votes POST to `/api/vote` and are stored
   in Vercel Blob by `backends/lib/store.js`. Results: `https://<site>/api/results`.
4. Keep the production branch pointed at `main`.

## Live results dashboard

Open `https://<your-site>/results` to watch votes come in: total votes and participants,
AI vs. hand-photoshopped pick rates with a significance check, a per-pair breakdown next to
the actual thumbnails, the left/right position check, how many AI picks each finished
participant made, and the latest 25 choices. It refreshes every 15 seconds and has a
**Download CSV** button. New votes can take up to a minute to appear.

## Analysis

```bash
node analysis/analyze.js votes.json              # file exported from /results
node analysis/analyze.js --url https://site/.netlify/functions/results
node analysis/analyze.js --sheets "https://docs.google.com/.../export?format=csv"
```

Output: total votes, unique sessions, AI vs human pick rates, left/right position check,
per-pair breakdown, and a two-proportion z-test.

## Data schema (one row per click)

| field | meaning |
|---|---|
| `ts` | ISO timestamp of the click |
| `sessionId` | random id per visitor (one session = up to 10 clicks) |
| `pairId` | which pair, `p01`–`p10` |
| `roundIndex` | 0–9, position in the shuffled order |
| `choice` | `ai` or `human` |
| `choiceSide` | `left` or `right` (for position-bias checks) |
| `ua` / `referrer` | user agent / referring page |

## Suggestions for your class analysis

- Aggregate: AI win rate vs human win rate + z-test (script does this).
- Per-pair: which specific videos favor which variant.
- Position check: `choiceSide` should be ≈ 50/50 — validates the counterbalancing.
- Session completeness: sessions with all 10 rounds vs partial (dropouts).
- If you add a pre-vote question (e.g. "how often do you click AI-looking thumbnails?"),
  extend `buildVotePayload` in `app.js`.

## Files

```
index.html, styles.css, app.js   frontend (app.js also exports pure logic for tests)
results.html/.css/.js            live results dashboard (/results)
config.js                        backend choice + endpoints + study text
data/pairs.js                    the 10 pairs (edit filenames here)
thumbnails/                      20 images (1280x720 placeholders until you swap in real ones)
backends/google-apps-script/     Option A
backends/netlify/functions/      Option B
backends/lib/store.js            shared storage (Blobs on Netlify, memory locally)
api/                             Option C (Vercel serverless)
analysis/analyze.js              results -> stats
tests/logic.test.js              node tests/logic.test.js
tools/generate_placeholders.py   regenerates placeholder thumbnails
```
