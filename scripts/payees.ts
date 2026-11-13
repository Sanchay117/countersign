/** Prints the demo market's public payee addresses (derived from MARKET_MNEMONIC in .env.local). */
import { readFileSync } from "node:fs";
import { mnemonicToAccount } from "viem/accounts";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const m = env.match(/^MARKET_MNEMONIC="?([^"\n]+)"?$/m)?.[1];
if (!m) throw new Error("MARKET_MNEMONIC missing; run npm run wallets");
for (let i = 0; i < 10; i++) console.log(i, mnemonicToAccount(m, { addressIndex: i }).address);
