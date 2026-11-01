// Storage for vote records. Environments:
//  - Supabase (default): PostgREST table `votes` via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//  - Vercel: Vercel Blob REST API (OIDC header or BLOB_READ_WRITE_TOKEN)
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
    " NETLIFY_BLOBS_TOKEN=" + !!process.env.NETLIFY_BLOBS_TOKEN +
    " SUPABASE_URL=" + !!process.env.SUPABASE_URL +
    " SUPABASE_SERVICE_ROLE_KEY=" + !!process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function supabaseBase() {
  let base = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (base && !/^https:\/\//i.test(base)) base = "https://" + base;
  if (base.endsWith("/rest/v1")) base = base.slice(0, -"/rest/v1".length);
  return base;
}

function supabaseStore() {
  const base = supabaseBase();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  const headers = {
    apikey: key,
    authorization: "Bearer " + key,
    "content-type": "application/json",
    prefer: "return=representation"
  };
  return {
    kind: "supabase",
    async append(record) {
      const res = await fetch(base + "/rest/v1/votes", {
        method: "POST",
        headers,
        body: JSON.stringify(record)
      });
      if (!res.ok && res.status !== 201) {
        throw new Error("supabase insert failed: " + res.status + " " + (await res.text()).slice(0, 300));
      }
    },
    async all() {
      const res = await fetch(base + "/rest/v1/votes?select=*&order=ts.asc", {
        headers: { ...headers, prefer: "" }
      });
      if (!res.ok) throw new Error("supabase select failed: " + res.status + " " + (await res.text()).slice(0, 300));
      return res.json();
    }
  };
}

async function getStore(req) {
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const s = supabaseStore();
    if (s.append) return s;
    throw new Error("Supabase store unavailable: " + s.error + ". Diagnostics: " + envDiag());
  }
  if (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL)) {
    const store = vercelBlobStore(req);
    if (store && store.append) return store;
    throw new Error("Vercel Blob store unavailable: " + (store && store.error ? store.error : "unknown") + ". Diagnostics: " + envDiag() + " oidcHeader=" + !!getOidcToken(req));
  }
  if (process.env.NETLIFY) {
    const { getStore, connectLambda } = require("@netlify/blobs");
    // Lambda-style handlers receive Blobs credentials on the event, not the environment
    if (req && req.blobs) connectLambda(req);
    // Deploy-scoped store: data is tied to this deploy's context and is guaranteed
    // readable from these very functions. Site-wide getStore() can hit a region where
    // the just-written key is not yet visible.
    const blobs = getStore(STORE, { deployID: process.env.DEPLOY_ID || undefined });
    return {
      kind: "netlify-blobs",
      async append(record) {
        const key = "votes/" + record.sessionId + "/" + record.pairId + "-" + record.storedAt.replace(/[:.]/g, "-");
        await blobs.setJSON(key, record);
      },
      async all() {
        const keys = [];
        for await (const page of blobs.list({ prefix: "votes/", paginate: true })) {
          for (const b of page.blobs) keys.push(b.key);
        }
        // fetch in parallel batches; one-by-one reads get slow once there are hundreds of votes
        const out = [];
        for (let i = 0; i < keys.length; i += 50) {
          const batch = await Promise.all(keys.slice(i, i + 50).map((k) => blobs.get(k, { type: "json" })));
          for (const v of batch) if (v) out.push(v);
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
