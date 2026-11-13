/**
 * Says what is configured and what is missing, without printing any secret.
 *   npx tsx --env-file=.env.local scripts/doctor.ts
 */
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { servConfigFromEnv, servModelId } from "../src/lib/serv";
import { activeChain } from "../src/lib/x402";

const cfg = servConfigFromEnv();
const chain = activeChain();
console.log(`SERV_API_KEY: ${cfg.apiKey ? `set (${cfg.apiKey.length} characters)` : "MISSING"}`);
console.log(`SERV model:   ${servModelId(cfg)}`);
console.log(`Network:      ${chain.label} (${chain.network}), ${chain.assetSymbol}`);

const key = (process.env.BUYER_PRIVATE_KEY ?? "").trim();
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) console.log("BUYER_PRIVATE_KEY: MISSING (run npm run wallets)");
else {
  const wallet = privateKeyToAccount(key as `0x${string}`).address;
  const client = createPublicClient({ transport: http(chain.rpcUrl) });
  const bal = await client.readContract({ address: chain.assetAddress, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  console.log(`Demo wallet:  ${wallet}`);
  console.log(`Balance:      ${formatUnits(bal, chain.assetDecimals)} ${chain.assetSymbol}${bal === 0n ? "  <- needs test funds" : ""}`);
}
