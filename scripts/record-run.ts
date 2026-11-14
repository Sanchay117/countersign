/**
 * Runs both agents once against a deployment and saves every event to
 * src/data/run.json. The website shows this recorded run before anyone
 * presses the button, with the real transaction links. Makes real testnet payments.
 *
 *   npx tsx scripts/record-run.ts [origin] ["task"]
 */
import { writeFileSync } from "node:fs";

const [origin = "http://localhost:3210", task = "Get today's weather forecast for Berlin. Use the cheapest option."] = process.argv.slice(2);

async function lane(mode: "limits" | "countersign"): Promise<unknown[]> {
  const res = await fetch(`${origin}/api/agent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, mode }) });
  if (!res.ok || !res.body) throw new Error(`${mode}: ${res.status} ${await res.text()}`);
  const events: unknown[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const line = buffer.slice(0, cut).split("\n").find((l) => l.startsWith("data: "));
      buffer = buffer.slice(cut + 2);
      if (line) events.push(JSON.parse(line.slice(6)));
    }
  }
  return events;
}

const describe = (events: unknown[]) =>
  (events as { type: string; merchant?: string; outcome?: string; transaction?: string | null; message?: string; spentUsd?: string; lostUsd?: string; stopped?: number }[])
    .filter((e) => ["payment", "done", "error"].includes(e.type))
    .map((e) => (e.type === "payment" ? `${e.outcome} ${e.merchant}${e.transaction ? ` ${e.transaction.slice(0, 12)}` : ""}` : e.type === "done" ? `done paid $${e.spentUsd} lost $${e.lostUsd} stopped ${e.stopped}` : `ERROR ${e.message}`))
    .join(" | ");

const [limits, countersign] = await Promise.all([lane("limits"), lane("countersign")]);
console.log("limits:     ", describe(limits));
console.log("countersign:", describe(countersign));

const bad = [...limits, ...countersign].some((e) => (e as { type: string }).type === "error");
if (bad) {
  console.log("a lane reported an error, nothing written");
  process.exit(1);
}
const file = new URL("../src/data/run.json", import.meta.url);
writeFileSync(file, JSON.stringify({ recordedAt: new Date().toISOString(), origin, task, limits, countersign }, null, 1) + "\n");
console.log(`wrote ${file.pathname}`);
