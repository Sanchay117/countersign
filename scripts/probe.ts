/**
 * Read-only look at the Kite testnet settlement asset and the facilitator.
 *   npx tsx scripts/probe.ts [address]
 */
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { KITE_TESTNET, FACILITATOR_URL } from "../src/lib/kite";

const chain = KITE_TESTNET;
const client = createPublicClient({ transport: http(chain.rpcUrl) });
const abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function version() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
]);

async function read(fn: string, args: unknown[] = []) {
  try {
    return await client.readContract({ address: chain.assetAddress, abi, functionName: fn as never, args: args as never });
  } catch (e) {
    return `ERR ${(e as Error).message.split("\n")[0]}`;
  }
}

console.log("chainId", await client.getChainId(), "block", await client.getBlockNumber());
for (const fn of ["name", "symbol", "decimals", "version", "totalSupply", "DOMAIN_SEPARATOR"]) console.log(fn, await read(fn));
const who = process.argv[2];
if (who) {
  const bal = (await read("balanceOf", [who])) as unknown as bigint;
  console.log("balance", who, typeof bal === "bigint" ? formatUnits(bal, chain.assetDecimals) : bal);
  console.log("KITE gas", formatUnits(await client.getBalance({ address: who as `0x${string}` }), 18));
}
const sup = await fetch(`${FACILITATOR_URL}/supported`);
const body = await sup.json();
console.log("facilitator /supported", sup.status, JSON.stringify(body).slice(0, 1500));
