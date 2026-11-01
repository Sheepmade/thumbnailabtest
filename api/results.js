const { getAllVotes } = require("../backends/lib/store");

module.exports = async function handler(req, res) {
  try {
    const votes = await getAllVotes();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ count: votes.length, votes });
  } catch (err) {
    console.error("results error:", err && err.message);
    res.status(500).json({
      error: "storage failed",
      detail: String(err && err.message || err),
      env: {
        VERCEL: !!process.env.VERCEL,
        BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
        BLOB_STORE_ID: !!process.env.BLOB_STORE_ID,
        VERCEL_API_TOKEN: !!process.env.VERCEL_API_TOKEN,
        NETLIFY: !!process.env.NETLIFY,
        NETLIFY_BLOBS_TOKEN: !!process.env.NETLIFY_BLOBS_TOKEN
      }
    });
  }
};
