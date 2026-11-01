(function () {
  "use strict";

  const cfg = window.APP_CONFIG;
  const pairs = window.PAIRS;
  const $ = (id) => document.getElementById(id);
  const REFRESH_MS = 15000;

  let lastVotes = [];
  let timer = null;

  function resultsUrl() {
    return cfg.backend === "vercel" ? cfg.endpoints.vercelResults : cfg.endpoints.results;
  }

  function pct(a, b) {
    return b === 0 ? "–" : Math.round((100 * a) / b) + "%";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function erf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  function summarize(votes) {
    const valid = votes.filter((v) => v && v.pairId && (v.choice === "ai" || v.choice === "human"));
    const byPair = {};
    pairs.forEach((p) => { byPair[p.id] = { ai: 0, human: 0 }; });
    const sessions = {};
    const side = { left: 0, right: 0 };
    let ai = 0;

    for (const v of valid) {
      byPair[v.pairId] = byPair[v.pairId] || { ai: 0, human: 0 };
      byPair[v.pairId][v.choice]++;
      if (v.choice === "ai") ai++;
      if (v.choiceSide === "left") side.left++;
      else if (v.choiceSide === "right") side.right++;
      const sid = v.sessionId || "unknown";
      // de-dupe per session+pair so a retried vote isn't counted twice in per-person stats
      sessions[sid] = sessions[sid] || {};
      sessions[sid][v.pairId] = v.choice;
    }

    const perSession = Object.values(sessions).map((s) => {
      const picks = Object.values(s);
      return { n: picks.length, ai: picks.filter((c) => c === "ai").length };
    });

    return {
      valid,
      total: valid.length,
      ai,
      human: valid.length - ai,
      byPair,
      side,
      sessionCount: perSession.length,
      complete: perSession.filter((s) => s.n >= pairs.length),
      avg: perSession.length ? perSession.reduce((a, s) => a + s.n, 0) / perSession.length : 0
    };
  }

  function setSplit(aId, bId, a, b) {
    const n = a + b;
    $(aId).style.width = n ? (100 * a) / n + "%" : "0";
    $(bId).style.width = n ? (100 * b) / n + "%" : "0";
  }

  function renderOverall(s) {
    setSplit("overall-ai", "overall-human", s.ai, s.human);
    $("overall-ai-label").textContent = pct(s.ai, s.total) + " (" + s.ai + ")";
    $("overall-human-label").textContent = pct(s.human, s.total) + " (" + s.human + ")";

    if (s.total < 10) {
      $("overall-stat").textContent = "Collect at least 10 votes for a significance check.";
      return;
    }
    // AI share vs. a 50/50 coin flip (normal approximation)
    const p = s.ai / s.total;
    const z = (p - 0.5) / Math.sqrt(0.25 / s.total);
    const pVal = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
    const leader = s.ai === s.human ? "Neither version" : (s.ai > s.human ? "AI thumbnails" : "Hand-photoshopped thumbnails");
    $("overall-stat").textContent =
      leader + " lead. Compared with a 50/50 split: z = " + z.toFixed(2) + ", p = " +
      (pVal < 0.001 ? "< 0.001" : pVal.toFixed(3)) +
      (pVal < 0.05 ? " — statistically significant." : " — not significant yet.");
  }

  function renderPairs(s) {
    const known = pairs.map((p) => p.id);
    const extra = Object.keys(s.byPair).filter((id) => !known.includes(id)).sort();
    const html = known.concat(extra).map((id) => {
      const p = pairs.find((x) => x.id === id) || {};
      const c = s.byPair[id] || { ai: 0, human: 0 };
      const n = c.ai + c.human;
      const aiW = n ? (100 * c.ai) / n : 0;
      const hW = n ? (100 * c.human) / n : 0;
      const winAi = n && c.ai > c.human;
      const winHuman = n && c.human > c.ai;
      return (
        '<div class="pair">' +
          '<div class="pair-thumb">' + (p.ai ? '<img src="' + esc(p.ai) + '" alt="' + esc(id) + ' AI thumbnail"' + (winAi ? ' class="pair-winner"' : "") + ">" : "") + "<span>AI</span></div>" +
          '<div class="pair-mid">' +
            '<div class="pair-head"><span>AI ' + pct(c.ai, n) + " (" + c.ai + ")</span>" +
              '<span class="pair-id">' + esc(id) + " · n=" + n + "</span>" +
              "<span>" + c.human + " (" + pct(c.human, n) + ") Human</span></div>" +
            '<div class="split" aria-hidden="true"><div class="split-ai" style="width:' + aiW + '%"></div><div class="split-human" style="width:' + hW + '%"></div></div>' +
          "</div>" +
          '<div class="pair-thumb">' + (p.human ? '<img src="' + esc(p.human) + '" alt="' + esc(id) + ' hand-photoshopped thumbnail"' + (winHuman ? ' class="pair-winner"' : "") + ">" : "") + "<span>Human</span></div>" +
        "</div>"
      );
    }).join("");
    $("pairs").innerHTML = html;
  }

  function renderSide(s) {
    setSplit("side-left", "side-right", s.side.left, s.side.right);
    const n = s.side.left + s.side.right;
    $("side-left-label").textContent = pct(s.side.left, n) + " (" + s.side.left + ")";
    $("side-right-label").textContent = pct(s.side.right, n) + " (" + s.side.right + ")";
  }

  function renderDist(s) {
    const buckets = new Array(pairs.length + 1).fill(0);
    s.complete.forEach((x) => { buckets[Math.min(x.ai, pairs.length)]++; });
    const max = Math.max(1, ...buckets);
    $("dist").innerHTML = buckets.map((count, k) =>
      '<div class="dist-col" title="' + count + " participant(s) picked AI " + k + " time(s)\">" +
        '<div class="dist-bar" style="height:' + (100 * count) / max + '%">' + (count ? "<span>" + count + "</span>" : "") + "</div>" +
        '<div class="dist-x">' + k + "</div>" +
      "</div>"
    ).join("");
  }

  function renderRecent(s) {
    const rows = s.valid
      .slice()
      .sort((a, b) => String(b.ts || b.storedAt).localeCompare(String(a.ts || a.storedAt)))
      .slice(0, 25);
    if (!rows.length) {
      $("recent").innerHTML = '<tr><td colspan="6" class="muted">No votes yet.</td></tr>';
      return;
    }
    $("recent").innerHTML = rows.map((v) => {
      const t = new Date(v.ts || v.storedAt);
      return "<tr>" +
        "<td>" + esc(isNaN(t) ? "" : t.toLocaleString()) + "</td>" +
        "<td>" + esc(String(v.sessionId || "").slice(0, 8)) + "</td>" +
        "<td>" + esc(v.pairId) + "</td>" +
        "<td>" + (typeof v.roundIndex === "number" ? v.roundIndex + 1 : "") + "</td>" +
        '<td><span class="tag tag-' + esc(v.choice) + '">' + (v.choice === "ai" ? "AI" : "Human") + "</span></td>" +
        "<td>" + esc(v.choiceSide || "") + "</td>" +
      "</tr>";
    }).join("");
  }

  function render(votes) {
    const s = summarize(votes);
    $("t-votes").textContent = s.total;
    $("t-sessions").textContent = s.sessionCount;
    $("t-complete").textContent = s.complete.length;
    $("t-avg").textContent = s.sessionCount ? s.avg.toFixed(1) : "–";
    renderOverall(s);
    renderPairs(s);
    renderSide(s);
    renderDist(s);
    renderRecent(s);
  }

  function toCsv(votes) {
    const cols = ["ts", "storedAt", "sessionId", "pairId", "roundIndex", "choice", "choiceSide", "ua", "referrer"];
    const cell = (x) => {
      const str = x == null ? "" : String(x);
      return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    return [cols.join(",")].concat(votes.map((v) => cols.map((c) => cell(v[c])).join(","))).join("\n");
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(lastVotes)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "thumbnail-votes-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function load() {
    $("refresh-btn").disabled = true;
    try {
      const r = await fetch(resultsUrl(), { cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.error || "HTTP " + r.status);
      lastVotes = Array.isArray(data) ? data : (data.votes || []);
      render(lastVotes);
      $("dash-error").classList.add("hidden");
      $("csv-btn").disabled = !lastVotes.length;
      $("dash-updated").textContent = "Updated " + new Date().toLocaleTimeString();
    } catch (err) {
      $("dash-error").textContent = "Couldn't load votes: " + err.message;
      $("dash-error").classList.remove("hidden");
    } finally {
      $("refresh-btn").disabled = false;
    }
  }

  function schedule() {
    clearInterval(timer);
    if ($("auto-refresh").checked) timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
  }

  $("dash-title").textContent = (cfg.studyTitle || "Thumbnail Study") + " — Results";
  $("refresh-btn").addEventListener("click", load);
  $("csv-btn").addEventListener("click", downloadCsv);
  $("auto-refresh").addEventListener("change", schedule);

  if (cfg.backend === "sheets") {
    $("dash-error").textContent = "This dashboard reads from the Netlify/Vercel results endpoint. With the Google Sheets backend, view results in the sheet instead.";
    $("dash-error").classList.remove("hidden");
  } else {
    load();
    schedule();
  }
})();
