const { getAllVotes } = require("../../lib/store");

exports.handler = async (event) => {
  try {
    const votes = await getAllVotes(event && event.headers ? event : undefined);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ count: votes.length, votes })
    };
  } catch (err) {
    console.error("results error:", err && err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "storage failed", detail: String(err && err.message || err) }) };
  }
};
