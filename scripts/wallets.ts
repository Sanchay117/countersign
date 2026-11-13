/**
 * Creates the testnet wallets the demo needs and writes them to .env.local.
 * Safe to re-run: existing keys are kept. These are throwaway Kite TESTNET
 * keys; never put a mainnet key here.
 *
 *   npm run wallets
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount, generateMnemonic, english, mnemonicToAccount } from "viem/accounts";

const path = new URL("../.env.local", import.meta.url);
const text = existsSync(path) ? readFileSync(path, "utf8") : "";
const env = new Map<string, string>();
for (const line of text.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2]);
}

const added: string[] = [];
function ensure(key: string, make: () => string) {
  if (!env.get(key)) {
    env.set(key, make());
    added.push(key);
  }
}

ensure("BUYER_PRIVATE_KEY", () => generatePrivateKey());
ensure("COUNTERSIGN_PRIVATE_KEY", () => generatePrivateKey());
ensure("MARKET_MNEMONIC", () => `"${generateMnemonic(english)}"`);
ensure("KITE_NETWORK", () => "testnet");
if (!env.has("SERV_API_KEY")) env.set("SERV_API_KEY", "");

const order = ["SERV_API_KEY", "KITE_NETWORK", "BUYER_PRIVATE_KEY", "COUNTERSIGN_PRIVATE_KEY", "MARKET_MNEMONIC"];
const keys = [...order.filter((k) => env.has(k)), ...[...env.keys()].filter((k) => !order.includes(k))];
writeFileSync(path, keys.map((k) => `${k}=${env.get(k)}`).join("\n") + "\n");

const buyer = privateKeyToAccount(env.get("BUYER_PRIVATE_KEY") as `0x${string}`);
const signer = privateKeyToAccount(env.get("COUNTERSIGN_PRIVATE_KEY") as `0x${string}`);
const mnemonic = (env.get("MARKET_MNEMONIC") ?? "").replace(/^"|"$/g, "");
console.log(added.length ? `added: ${added.join(", ")}` : "all keys already present");
console.log(`buyer (demo agent wallet):   ${buyer.address}`);
console.log(`countersign (receipt signer): ${signer.address}`);
for (let i = 0; i < 4; i++) console.log(`market payee ${i}:               ${mnemonicToAccount(mnemonic, { addressIndex: i }).address}`);
