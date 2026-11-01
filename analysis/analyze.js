#!/usr/bin/env node
// Usage:
//   node analysis/analyze.js votes.json        (file with { votes: [...] } or [...])
//   node analysis/analyze.js --url <results-url>   (e.g. https://your-site/.netlify/functions/results)
//   node analysis/analyze.js --sheets <csv-url>    (exported Google Sheets CSV of the Votes tab)
"use strict";

const fs = require("node:fs");

function parseArgs(argv) {
  const args = { file: null, url: null, sheets: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--url") args.url = argv[++i];
    else if (argv[i] === "--sheets") args.sheets = argv[++i];
    else args.file = argv[i];
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function loadVotes(args) {
  if (args.url) {
    const res = await fetch(args.url);
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : data.votes;
  }
  if (args.sheets) {
    const res = await fetch(args.sheets);
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    return parseCsv(await res.text());
  }
  if (args.file) {
    const data = JSON.parse(fs.readFileSync(args.file, "utf8"));
    return Array.isArray(data) ? data : data.votes;
  }
  throw new Error("provide a votes file, --url, or --sheets");
}

function summarize(votes) {
  const byPair = {};
  const sessions = new Set();
  let side = { left: 0, right: 0 };
  let valid = 0;

  for (const v of votes) {
    if (!v || !v.pairId || !["ai", "human"].includes(v.choice)) continue;
    valid++;
    sessions.add(v.sessionId || "unknown");
    byPair[v.pairId] = byPair[v.pairId] || { ai: 0, human: 0 };
    byPair[v.pairId][v.choice]++;
    if (v.choiceSide === "left") side.left++; else if (v.choiceSide === "right") side.right++;
  }

  const total = Object.values(byPair).reduce((a, p) => a + p.ai + p.human, 0);
  const aiWins = Object.values(byPair).reduce((a, p) => a + p.ai, 0);
  const humanWins = total - aiWins;

  console.log("=== Thumbnail A/B study results ===");
  console.log("valid votes:        " + valid);
  console.log("unique sessions:    " + sessions.size);
  console.log("AI picks:           " + aiWins + " (" + pct(aiWins, total) + ")");
  console.log("Human picks:        " + humanWins + " (" + pct(humanWins, total) + ")");
  console.log("clicked left/right: " + side.left + " / " + side.right +
    " (position check; should be ~50/50 if counterbalanced)");
  console.log("");
  console.log("per-pair breakdown:");
  const pairIds = Object.keys(byPair).sort();
  for (const id of pairIds) {
    const p = byPair[id];
    const n = p.ai + p.human;
    console.log(
      "  " + id + ":  AI " + p.ai + " (" + pct(p.ai, n) + ")  vs  Human " + p.human +
      " (" + pct(p.human, n) + ")   n=" + n
    );
  }

  // two-proportion z-test (pooled) for AI vs human overall
  if (total >= 10) {
    const p1 = aiWins / total, p2 = humanWins / total;
    const n1 = total / 2, n2 = total / 2;
    const pPool = (aiWins + humanWins) / (2 * total);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
    const z = (p1 - p2) / se;
    const pVal = 2 * (1 - Phi(Math.abs(z)));
    console.log("");
    console.log("overall z-test AI vs human: z=" + z.toFixed(3) + ", two-sided p=" + pVal.toExponential(2) +
      (pVal < 0.05 ? "  (statistically significant)" : "  (not significant at 0.05)"));
  }
  return { byPair, sessions: sessions.size, total, aiWins, humanWins, side };
}

function pct(a, b) {
  return b === 0 ? "n/a" : (100 * a / b).toFixed(1) + "%";
}

function Phi(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

(async () => {
  const args = parseArgs(process.argv);
  const votes = await loadVotes(args);
  if (!votes || !votes.length) {
    console.log("no votes found");
    process.exit(1);
  }
  summarize(votes);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
