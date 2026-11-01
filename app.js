(function (global) {
  "use strict";

  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function createSession(pairs, rng) {
    const sessionId =
      (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "s-" + Math.floor(rng() * 1e15).toString(36) + Date.now().toString(36);
    const order = shuffle(pairs.map((p) => p.id), rng);
    const rounds = order.map((pairId, i) => {
      const pair = pairs.find((p) => p.id === pairId);
      const aiLeft = rng() < 0.5;
      return {
        index: i,
        pairId: pair.id,
        left: aiLeft ? "ai" : "human",
        right: aiLeft ? "human" : "ai",
        leftSrc: aiLeft ? pair.ai : pair.human,
        rightSrc: aiLeft ? pair.human : pair.ai
      };
    });
    return { sessionId, rounds, startedAt: new Date().toISOString() };
  }

  function buildVotePayload(session, round, choice, extra) {
    return {
      sessionId: session.sessionId,
      pairId: round.pairId,
      roundIndex: round.index,
      choice,
      choiceSide: choice === round.left ? "left" : "right",
      ts: new Date().toISOString(),
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      referrer: typeof document !== "undefined" ? document.referrer : "",
      ...(extra || {})
    };
  }

  const logic = { makeRng, shuffle, createSession, buildVotePayload };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = logic;
  }

  if (typeof window === "undefined") return;

  const cfg = window.APP_CONFIG;
  const pairs = window.PAIRS;
  const $ = (id) => document.getElementById(id);

  let session = null;
  let current = 0;
  let sending = false;

  function show(id) {
    ["screen-start", "screen-vote", "screen-done", "screen-error"].forEach((s) => {
      $(s).classList.toggle("hidden", s !== id);
    });
  }

  function startStudy() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    session = createSession(pairs, makeRng(seed));
    current = 0;
    $("study-title").textContent = cfg.studyTitle || "Thumbnail Study";
    $("prompt").textContent = cfg.prompt || "Which thumbnail would you click?";
    renderRound();
    show("screen-vote");
  }

  function renderRound() {
    const round = session.rounds[current];
    $("round-label").textContent = "Choice " + (current + 1) + " of " + session.rounds.length;
    $("img-left").src = round.leftSrc;
    $("img-right").src = round.rightSrc;
    $("vote-status").textContent = "";
  }

  function sendVote(payload) {
    const backend = cfg.backend;
    if (backend === "sheets") {
      const url = cfg.endpoints.sheets;
      if (!url) return Promise.reject(new Error("Sheets endpoint not configured"));
      return fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
    }
    const url = backend === "vercel" ? cfg.endpoints.vercelVote : cfg.endpoints.vote;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then((r) => {
      if (!r.ok) throw new Error("Vote failed: " + r.status);
      return r.json().catch(() => ({}));
    });
  }

  function choose(side) {
    if (sending || !session || current >= session.rounds.length) return;
    const round = session.rounds[current];
    const choice = side === "left" ? round.left : round.right;
    const payload = buildVotePayload(session, round, choice);
    sending = true;
    $("vote-status").textContent = "Saving…";
    sendVote(payload)
      .catch((err) => {
        try { localStorage.setItem("pending_" + payload.sessionId + "_" + payload.pairId, JSON.stringify(payload)); } catch (e) {}
        $("vote-status").textContent = "Couldn't reach the server — moving on.";
        console.warn(err);
      })
      .finally(() => {
        sending = false;
        current++;
        if (current >= session.rounds.length) {
          show("screen-done");
        } else {
          renderRound();
        }
      });
  }

  $("start-btn").addEventListener("click", startStudy);
  $("thumb-left").addEventListener("click", () => choose("left"));
  $("thumb-right").addEventListener("click", () => choose("right"));
  document.addEventListener("keydown", (e) => {
    if ($("screen-vote").classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") choose("left");
    if (e.key === "ArrowRight") choose("right");
  });

  show("screen-start");
})(typeof window !== "undefined" ? window : globalThis);
