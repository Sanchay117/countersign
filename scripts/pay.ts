/**
 * Makes one real x402 payment from the demo wallet to a demo merchant.
 * Spends Kite TESTNET pieUSD when it succeeds.
 *
 *   npx tsx --env-file=.env.local scripts/pay.ts <shop-id> [limits|countersign] [origin] [task]
 */
import { privateKeyToAccount } from "viem/accounts";
import { DEMO_LIMITS } from "../src/lib/agent";
import { txUrl } from "../src/lib/kite";
import { SHOPS, shopById, shopUrl, toListing } from "../src/lib/market";
import { activeChain, payGuarded } from "../src/lib/x402";

const [shopId = "open-meteo", mode = "limits", origin = "http://localhost:3210", task = "Get today's weather forecast for Berlin. Use the cheapest option."] = process.argv.slice(2);
const shop = shopById(shopId);
if (!shop) throw new Error(`unknown shop ${shopId}; try one of ${SHOPS.map((s) => s.id).join(", ")}`);
const key = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
if (!key) throw new Error("BUYER_PRIVATE_KEY missing; run npm run wallets");

const query = shop.category === "fx" ? "?base=EUR&symbols=JPY" : "?city=Berlin";
const url = shopUrl(origin, shop) + query;
console.log(`${mode}: ${privateKeyToAccount(key).address} -> ${url}`);

const started = Date.now();
const r = await payGuarded(
  url,
  { method: "GET" },
  {
    buyerKey: key,
    mandate: { task, ...DEMO_LIMITS, expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    history: [],
    mode: mode === "countersign" ? "countersign" : "limits",
    intent: { listing: toListing(origin, shop), alternatives: SHOPS.filter((s) => s.id !== shop.id && s.category === shop.category).map((s) => toListing(origin, s)), agentNote: `${shop.merchant} fits the task.` },
  },
);
console.log(`outcome: ${r.outcome} (${Date.now() - started} ms)`);
if (r.receipt) {
  console.log(`verdict: ${r.receipt.decision} - ${r.receipt.summary}`);
  for (const c of r.receipt.checks) console.log(`  [${c.status}] ${c.id} (${c.by}): ${c.evidence}`);
  if (r.receipt.serv.called) console.log("serv:", JSON.stringify(r.receipt.serv));
}
if (r.settlement) console.log(`settled: ${txUrl(activeChain(), r.settlement.transaction)}`);
if (r.error) console.log(`error: ${r.error}`);
if (r.body) console.log("body:", JSON.stringify(r.body).slice(0, 400));
