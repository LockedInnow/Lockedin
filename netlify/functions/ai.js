exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let prompt;
  try { prompt = JSON.parse(event.body).prompt; }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Bad request" }) }; }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 10000) {
    return { statusCode: 400, body: JSON.stringify({ error: "Fel längd" }) };
  }
  const headers = { "content-type": "application/json" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      const m = (data.error && data.error.message) || "Anthropic-fel";
      return { statusCode: 502, headers, body: JSON.stringify({ error: m }) };
    }
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Serverfel: " + e.message }) };
  }
};
