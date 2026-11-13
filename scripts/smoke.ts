/**
 * Smoke test against a running deployment. Read-only except where noted.
 *   npx tsx scripts/smoke.ts [origin]
 */
export {};

const origin = (process.argv[2] ?? "http://localhost:3210").replace(/\/$/, "");

function decode(header: string | null) {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return header;
  }
}

async function show(label: string, url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`\n== ${label}: ${res.status}`);
  const pr = decode(res.headers.get("PAYMENT-REQUIRED"));
  if (pr) console.log("PAYMENT-REQUIRED", JSON.stringify(pr, null, 1));
  console.log(text.slice(0, 700));
  return res;
}

await show("healthz", `${origin}/healthz`);
await show("status", `${origin}/api/status`);
await show("catalog", `${origin}/api/market`);
await show("honest shop, unpaid", `${origin}/api/market/open-meteo/v1/forecast?city=Berlin`);
await show("bait-and-switch shop, unpaid", `${origin}/api/market/weatherly/v1/forecast?city=Berlin`);
await show("unknown shop", `${origin}/api/market/nope/v1/forecast`);
await show("paid check API, unpaid", `${origin}/v1/check`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
await show("free check: rule block (R01)", `${origin}/api/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: "R01" }) });
