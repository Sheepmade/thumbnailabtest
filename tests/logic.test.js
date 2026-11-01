"use strict";
const assert = require("node:assert");
const { makeRng, shuffle, createSession, buildVotePayload } = require("../app.js");

const pairs = [
  { id: "p01", ai: "a1.jpg", human: "h1.jpg" },
  { id: "p02", ai: "a2.jpg", human: "h2.jpg" },
  { id: "p03", ai: "a3.jpg", human: "h3.jpg" }
];

// determinism
{
  const r1 = makeRng(42), r2 = makeRng(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(r1(), r2());
}

// shuffle preserves multiset
{
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const s = shuffle(arr, makeRng(7));
  assert.deepStrictEqual(s.slice().sort((a, b) => a - b), arr);
  assert.notDeepStrictEqual(s, arr);
}

// session: all pairs exactly once, left/right are complementary
{
  const rng = makeRng(123);
  const session = createSession(pairs, rng);
  assert.strictEqual(session.rounds.length, 3);
  assert.deepStrictEqual(session.rounds.map((r) => r.pairId).sort(), ["p01", "p02", "p03"]);
  for (const r of session.rounds) {
    assert.ok((r.left === "ai" && r.right === "human") || (r.left === "human" && r.right === "ai"));
    const pair = pairs.find((p) => p.id === r.pairId);
    if (r.left === "ai") {
      assert.strictEqual(r.leftSrc, pair.ai);
      assert.strictEqual(r.rightSrc, pair.human);
    } else {
      assert.strictEqual(r.leftSrc, pair.human);
      assert.strictEqual(r.rightSrc, pair.ai);
    }
  }
  assert.ok(session.sessionId.length > 0);
}

// counterbalancing: over many sessions both sides appear for ai
{
  let aiLeft = 0, aiRight = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = createSession(pairs, makeRng(seed));
    for (const r of s.rounds) {
      if (r.left === "ai") aiLeft++; else aiRight++;
    }
  }
  assert.ok(aiLeft > 250 && aiRight > 250, `imbalance: aiLeft=${aiLeft} aiRight=${aiRight}`);
}

// payload correctness
{
  const session = createSession(pairs, makeRng(9));
  const round = session.rounds[0];
  const pAi = buildVotePayload(session, round, "ai");
  assert.strictEqual(pAi.choice, "ai");
  assert.strictEqual(pAi.choiceSide, round.left === "ai" ? "left" : "right");
  const pHuman = buildVotePayload(session, round, "human");
  assert.strictEqual(pHuman.choiceSide, round.left === "human" ? "left" : "right");
  assert.notStrictEqual(pAi.choiceSide, pHuman.choiceSide);
  assert.strictEqual(pAi.sessionId, session.sessionId);
  assert.strictEqual(pAi.pairId, round.pairId);
}

// sessions differ across seeds (randomization works)
{
  const a = createSession(pairs, makeRng(1)).rounds.map((r) => r.pairId).join(",");
  const b = createSession(pairs, makeRng(2)).rounds.map((r) => r.pairId).join(",");
  assert.notStrictEqual(a, b);
}

console.log("all logic tests passed");
