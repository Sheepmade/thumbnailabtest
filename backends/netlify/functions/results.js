const { getAllVotes } = require("../../lib/store");

exports.handler = async () => {
  try {
    const votes = await getAllVotes();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ count: votes.length, votes })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "storage failed" }) };
  }
};
