// Verify/enrich a place using Gemini + Google Search grounding.
// Grounding makes the model answer from live web results and return the source
// URLs it used — so we capture provenance instead of trusting a raw LLM guess.
//
//   node --env-file=.env scripts/gemini-verify.mjs "Manipal Hospitals Siliguri"
//
// SECRET: reads GEMINI_API_KEY from env. Never ship this key in the client app.
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

const query = process.argv[2] || 'Manipal Hospitals Siliguri';
const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const prompt =
  `Using Google Search, find the CURRENT verified details for this place in Siliguri, ` +
  `West Bengal, India: "${query}". ` +
  `Reply ONLY with compact JSON: {"name":"","address":"","phone":"","hours":"","exists":true/false,"notes":""}. ` +
  `Use null for anything you cannot confirm from search results. Do not invent a phone number.`;

const body = {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  tools: [{ google_search: {} }],
};

async function call(useBearer) {
  const headers = { 'Content-Type': 'application/json' };
  let url = ENDPOINT;
  if (useBearer) headers['Authorization'] = `Bearer ${KEY}`;
  else url += `?key=${KEY}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`Query: ${query}`);
  // Try API-key param first, then OAuth Bearer.
  let r = await call(false);
  if (r.status === 401 || r.status === 403) {
    console.log(`  key-param auth failed (${r.status}); retrying as Bearer token...`);
    r = await call(true);
  }
  if (r.status !== 200) {
    console.error(`Gemini API error ${r.status}:`, JSON.stringify(r.json).slice(0, 500));
    process.exit(1);
  }
  const cand = r.json.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text).join('') ?? '';
  console.log('\n--- model answer ---\n' + text);

  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.map((c) => c.web?.uri).filter(Boolean);
  console.log('\n--- grounding sources (' + sources.length + ') ---');
  sources.forEach((s) => console.log('  ' + s));
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
