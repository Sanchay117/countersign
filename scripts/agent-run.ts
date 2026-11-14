/**
 * Runs the shopping agent once against a running deployment and prints what happens.
 * Makes real testnet payments when the demo wallet is funded.
 *
 *   npx tsx scripts/agent-run.ts <limits|countersign> ["task"] [origin]
 */
export {};

const [mode = "countersign", task = "Get today's weather forecast for Berlin. Use the cheapest option.", origin = "http://localhost:3210"] = process.argv.slice(2);
const started = Date.now();
const res = await fetch(`${origin}/api/agent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, mode }) });
if (!res.ok || !res.body) {
  console.log(`could not start: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
const t = () => `${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s`;
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let cut: number;
  while ((cut = buffer.indexOf("\n\n")) >= 0) {
    const line = buffer.slice(0, cut).split("\n").find((l) => l.startsWith("data: "));
    buffer = buffer.slice(cut + 2);
    if (!line) continue;
    const e = JSON.parse(line.slice(6));
    switch (e.type) {
      case "start":
        console.log(`${t()} start: ${e.mode}, model ${e.model}, wallet ${e.wallet}`);
        break;
      case "browse":
        console.log(`${t()} browse: ${e.listings.length} listings`);
        break;
      case "thought":
        console.log(`${t()} thought: ${e.text}`);
        break;
      case "attempt":
        console.log(`${t()} attempt: ${e.merchant} | ${e.note}`);
        break;
      case "verdict":
        console.log(`${t()} verdict: ${e.receipt.decision} | ${e.receipt.summary}`);
        for (const c of e.receipt.checks) if (c.status !== "pass") console.log(`         [${c.status}] ${c.id}: ${c.evidence}`);
        break;
      case "payment":
        console.log(`${t()} payment: ${e.outcome} $${e.amountUsd} to ${e.merchant}${e.trap ? ` (TRAP: ${e.trap})` : ""}${e.transaction ? ` tx ${e.transaction}` : ""}${e.error ? ` | ${e.error}` : ""}`);
        break;
      case "answer":
        console.log(`${t()} answer: ${e.text}`);
        break;
      case "done":
        console.log(`${t()} done: paid $${e.spentUsd}, lost to traps $${e.lostUsd}, stopped ${e.stopped}, payments ${e.payments}`);
        break;
      default:
        console.log(`${t()} ${e.type}: ${e.message ?? ""}`);
    }
  }
}
