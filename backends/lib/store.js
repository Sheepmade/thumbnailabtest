// Storage for vote records. Three environments:
//  - Netlify: Netlify Blobs (store "votes"), configured automatically
//  - Vercel: Vercel Blob via @vercel/blob (BLOB_READ_WRITE_TOKEN is set
//    automatically when you add a Blob store in the Vercel dashboard)
//  - Local dev: in-memory array

const STORE = "votes";
let memory = [];

async function getStore() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put, list, get } = require("@vercel/blob");
    return {
      kind: "vercel",
      async append(record) {
        const key = record.sessionId + "/" + record.pairId + "/" + record.storedAt + ".json";
        await put(key, JSON.stringify(record), { access: "public", contentType: "application/json", addRandomSuffix: false });
      },
      async all() {
        const out = [];
        let cursor;
        do {
          const page = await list({ cursor, limit: 1000 });
          for (const item of page.blobs) {
            const res = await fetch(item.url);
            if (res.ok) out.push(await res.json());
          }
          cursor = page.cursor;
        } while (cursor);
        return out;
      }
    };
  }
  if (process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY) {
    const { getStore } = require("@netlify/blobs");
    const blobs = getStore(STORE);
    return {
      kind: "netlify",
      async append(record) {
        const key = record.sessionId + ":" + record.pairId + ":" + record.storedAt;
        await blobs.setJSON(key, record);
      },
      async all() {
        const out = [];
        for await (const { key } of blobs.list({ prefix: "" })) {
          const v = await blobs.getJSON(key);
          if (v) out.push(v);
        }
        return out;
      }
    };
  }
  return {
    kind: "memory",
    async append(record) { memory.push(record); },
    async all() { return memory.slice(); }
  };
}

async function appendVote(vote) {
  const record = { ...vote, storedAt: new Date().toISOString() };
  const store = await getStore();
  await store.append(record);
  return record;
}

async function getAllVotes() {
  const store = await getStore();
  return store.all();
}

module.exports = { appendVote, getAllVotes };
