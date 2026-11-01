const { appendVote } = require("../backends/lib/store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const body = req.body || {};
  const required = ["sessionId", "pairId", "choice"];
  for (const k of required) {
    if (!body[k]) { res.status(400).json({ error: "missing " + k }); return; }
  }
  if (!["ai", "human"].includes(body.choice)) {
    res.status(400).json({ error: "choice must be ai|human" });
    return;
  }
  try {
    await appendVote(body, req);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("vote error:", err && err.message);
    res.status(500).json({ error: "storage failed", detail: String(err && err.message || err) });
  }
};
