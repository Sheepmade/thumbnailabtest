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
    " VERCEL_OIDC_TOKEN=" + !!process.env.VERCEL_OIDC_TOKEN +
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

function getOidcToken(req) {
  const h = req && req.headers ? req.headers["x-vercel-oidc-token"] : undefined;
  if (h) return h;
  return process.env.VERCEL_OIDC_TOKEN || undefined;
}

function blobHeaders(req, extra) {
  const h = {
    "x-vercel-blob-store-id": process.env.BLOB_STORE_ID,
    "x-api-version": "7",
    ...(extra || {})
  };
  const oidc = getOidcToken(req);
  const rw = process.env.BLOB_READ_WRITE_TOKEN;
  if (rw) h.authorization = "Bearer " + rw;
  else if (oidc) h.authorization = "Bearer " + oidc;
  return h;
}

function vercelBlobStore(req) {
  if (!process.env.BLOB_STORE_ID) return { error: "BLOB_STORE_ID missing" };
  if (!getOidcToken(req) && !process.env.BLOB_READ_WRITE_TOKEN) {
    return { error: "no OIDC token (x-vercel-oidc-token header / VERCEL_OIDC_TOKEN) and no BLOB_READ_WRITE_TOKEN" };
  }
  return {
    kind: "vercel-blob",
    async append(record) {
      const key = "votes/" + record.sessionId + "/" + record.pairId + "-" + record.storedAt.replace(/[:.]/g, "-") + ".json";
      const res = await fetch(BLOB_API + "/" + encodeURIComponent(key) + "?addRandomSuffix=false", {
        method: "PUT",
        headers: blobHeaders(req, { "content-type": "application/json", "x-content-type": "application/json", "access": "public" }),
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
        const res = await fetch(BLOB_API + "/?" + q.toString(), { headers: blobHeaders(req) });
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

async function getStore(req) {
  if (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL)) {
    const store = vercelBlobStore(req);
    if (store && store.append) return store;
    throw new Error("Vercel Blob store unavailable: " + (store && store.error ? store.error : "unknown") + ". Diagnostics: " + envDiag() + " oidcHeader=" + !!getOidcToken(req));
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

async function appendVote(vote, req) {
  const record = { ...vote, storedAt: new Date().toISOString() };
  const store = await getStore(req);
  await store.append(record);
  return record;
}

async function getAllVotes(req) {
  const store = await getStore(req);
  return store.all();
}

module.exports = { appendVote, getAllVotes };
