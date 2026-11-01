// Storage for vote records. Environments:
//  - Vercel: Vercel Blob REST API. Vercel injects BLOB_READ_WRITE_TOKEN (the
//    read/write token, format vercel_blob_rw_<STOREID>_...) when a Blob store is
//    connected to the project. If only BLOB_STORE_ID is present we cannot call the
//    REST API directly, so we fail loudly instead.
//  - Netlify: Netlify Blobs (store "votes"), configured automatically
//  - Local dev: in-memory array

const STORE = "votes";
const BLOB_API = "https://blob.vercel-storage.com";
let memory = [];

function envDiag() {
  return "VERCEL=" + !!process.env.VERCEL +
    " BLOB_READ_WRITE_TOKEN=" + !!process.env.BLOB_READ_WRITE_TOKEN +
    " BLOB_STORE_ID=" + !!process.env.BLOB_STORE_ID +
    " VERCEL_API_TOKEN=" + !!process.env.VERCEL_API_TOKEN +
    " VERCEL_PROJECT_ID=" + !!process.env.VERCEL_PROJECT_ID +
    " NETLIFY=" + !!process.env.NETLIFY +
    " NETLIFY_BLOBS_TOKEN=" + !!process.env.NETLIFY_BLOBS_TOKEN;
}

function memoryStore() {
  return {
    kind: "memory",
    async append(record) { memory.push(record); },
    async all() { return memory.slice(); }
  };
}

const VERCEL_API = "https://api.vercel.com";

async function getVercelRwToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  const storeId = process.env.BLOB_STORE_ID;
  const bearer = process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN;
  if (!storeId || !bearer) return { error: "missing BLOB_STORE_ID or VERCEL_API_TOKEN" };
  const res = await fetch(VERCEL_API + "/v1/integrations/stores/" + encodeURIComponent(storeId) + "/access-token", {
    method: "POST",
    headers: { authorization: "Bearer " + bearer, "content-type": "application/json" },
    body: JSON.stringify({ projectId: process.env.VERCEL_PROJECT_ID || undefined })
  });
  const text = await res.text();
  if (!res.ok) return { error: "vercel api " + res.status + ": " + text.slice(0, 300) };
  try {
    const data = JSON.parse(text);
    if (data.token) return { token: data.token };
    return { error: "vercel api 200 but no token in response: " + text.slice(0, 300) };
  } catch {
    return { error: "vercel api returned non-json: " + text.slice(0, 300) };
  }
}

async function vercelBlobStore() {
  const t = await getVercelRwToken();
  if (!t.token) return { error: t.error || "could not mint blob token" };
  const auth = "Bearer " + t.token;
  return {
    kind: "vercel-blob",
    async append(record) {
      const key = "votes/" + record.sessionId + "/" + record.pairId + "-" + record.storedAt.replace(/[:.]/g, "-") + ".json";
      const res = await fetch(BLOB_API + "/" + encodeURIComponent(key) + "?addRandomSuffix=false", {
        method: "PUT",
        headers: { authorization: auth, "content-type": "application/json", "x-content-type": "application/json", "access": "public" },
        body: JSON.stringify(record)
      });
      if (!res.ok) throw new Error("blob put failed: " + res.status + " " + (await res.text()).slice(0, 200));
    },
    async all() {
      const out = [];
      let cursor;
      do {
        const q = new URLSearchParams({ prefix: "votes/", limit: "1000" });
        if (cursor) q.set("cursor", cursor);
        const res = await fetch(BLOB_API + "/?" + q.toString(), { headers: { authorization: auth } });
        if (!res.ok) throw new Error("blob list failed: " + res.status + " " + (await res.text()).slice(0, 200));
        const page = await res.json();
        for (const item of page.blobs || []) {
          const r = await fetch(item.url);
          if (r.ok) out.push(await r.json());
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    }
  };
}

async function getStore() {
  if (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL)) {
    const store = await vercelBlobStore();
    if (store && store.append) return store;
    throw new Error("Vercel Blob store unavailable: " + (store && store.error ? store.error : "unknown") + ". Diagnostics: " + envDiag());
  }
  if (process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY) {
    const { getStore } = require("@netlify/blobs");
    const blobs = getStore(STORE);
    return {
      kind: "netlify-blobs",
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
  if (process.env.VERCEL || process.env.NETLIFY) {
    throw new Error(
      "No usable store credentials. On Vercel, connecting a Blob store to the project must inject " +
      "BLOB_READ_WRITE_TOKEN into functions (Storage tab -> Connect the store to THIS project, then REDEPLOY). " +
      "Diagnostics: " + envDiag()
    );
  }
  return memoryStore();
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
