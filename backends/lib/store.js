// Netlify storage: uses Netlify Blobs when deployed on Netlify
// (NETLIFY_BLOBS_TOKEN / BLOB store "votes" is created automatically).
// Falls back to an in-memory store for local `netlify dev` testing.

const STORE = "votes";
let memory = [];

async function getBlobs() {
  if (process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY) {
    const { getStore } = require("@netlify/blobs");
    return getStore(STORE);
  }
  return null;
}

async function appendVote(vote) {
  const blobs = await getBlobs();
  const record = { ...vote, storedAt: new Date().toISOString() };
  if (blobs) {
    const key = record.sessionId + ":" + record.pairId + ":" + record.storedAt;
    await blobs.setJSON(key, record);
  } else {
    memory.push(record);
  }
  return record;
}

async function getAllVotes() {
  const blobs = await getBlobs();
  if (blobs) {
    const out = [];
    for await (const { key, value } of blobs.list({ prefix: "" })) {
      const v = await blobs.getJSON(key);
      if (v) out.push(v);
    }
    return out;
  }
  return memory.slice();
}

module.exports = { appendVote, getAllVotes };
