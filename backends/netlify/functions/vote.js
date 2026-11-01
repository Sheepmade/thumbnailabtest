const { appendVote } = require("../../lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method not allowed" }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid json" }) };
  }
  const required = ["sessionId", "pairId", "choice"];
  for (const k of required) {
    if (!body[k]) return { statusCode: 400, body: JSON.stringify({ error: "missing " + k }) };
  }
  if (!["ai", "human"].includes(body.choice)) {
    return { statusCode: 400, body: JSON.stringify({ error: "choice must be ai|human" }) };
  }
  try {
    await appendVote(body, event);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("vote error:", err && err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "storage failed", detail: String(err && err.message || err) }) };
  }
};
