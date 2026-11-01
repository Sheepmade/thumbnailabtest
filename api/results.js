const { getAllVotes } = require("../backends/lib/store");

module.exports = async function handler(req, res) {
  try {
    const votes = await getAllVotes();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ count: votes.length, votes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "storage failed" });
  }
};
