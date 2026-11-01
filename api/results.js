const { getAllVotes } = require("../backends/lib/store");

module.exports = async function handler(req, res) {
  try {
    const votes = await getAllVotes();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ count: votes.length, votes });
  } catch (err) {
    console.error("results error:", err && err.message);
    res.status(500).json({ error: "storage failed", detail: String(err && err.message || err) });
  }
};
