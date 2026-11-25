const SB = "https://pclhlbvuepsseuvsbaxg.supabase.co";
const KEY = "sb_publishable_2bVOQdcM0Jeuc5STzR4sbw_q-5ox2ZY";
const hits = new Map();
const WINDOW = 3600000;

function limited(key, max) {
  const now = Date.now();
  const a = (hits.get(key) || []).filter(t => now - t < WINDOW);
  if (a.length >= max) { hits.set(key, a); return true; }
  a.push(now);
  hits.set(key, a);
  if (hits.size > 5000) hits.clear();
  return false;
}

async function getUserId(auth) {
  if (!auth || !auth.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(SB + "/auth/v1/user", { headers: { apikey: KEY, Authorization: auth } });
    if (!r.ok) return null;
    const u = await r.json();
    return u.id || null;
  } catch { return null; }
}

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  const fail = (code, error) => ({ statusCode: code, headers, body: JSON.stringify({ error }) });
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const h = event.headers || {};
  const uid = await getUserId(h.authorization || h.Authorization);
  if (!uid) return fail(401, "Logga in för att använda AI:n.");

  const ip = h["x-nf-client-connection-ip"] || (h["x-forwarded-for"] || "").split(",")[0] || "okänd";
  if (limited("u:" + uid, 30) || limited("ip:" + ip, 90)) {
    return fail(429, "För många förfrågningar. Vänta en stund och försök igen.");
  }

  let prompt, image;
  try { ({ prompt, image } = JSON.parse(event.body)); }
  catch { return fail(400, "Bad request"); }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 10000) return fail(400, "Fel längd");
  if (image !== undefined && (typeof image !== "string" || image.length > 4000000)) return fail(400, "Bilden är för stor");

  const content = image
    ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
       { type: "text", text: prompt }]
    : prompt;

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
        messages: [{ role: "user", content }]
      })
    });
    const data = await r.json();
    if (!r.ok) return fail(502, (data.error && data.error.message) || "Anthropic-fel");
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (e) {
    return fail(500, "Serverfel: " + e.message);
  }
};
