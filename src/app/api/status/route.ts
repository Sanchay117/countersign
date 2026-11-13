/** GET /api/status: what the live demo is running on. Addresses and balances only, never keys. */
import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addressUrl } from "@/lib/kite";
import { POLICY_VERSION } from "@/lib/policy";
import { receiptSigner } from "@/lib/receipt";
import { servConfigFromEnv, servFeatures, servModelId } from "@/lib/serv";
import { activeChain } from "@/lib/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const chain = activeChain();
  const cfg = servConfigFromEnv();
  const key = (process.env.BUYER_PRIVATE_KEY ?? "").trim();
  let wallet: string | null = null;
  let balance: string | null = null;
  if (/^0x[0-9a-fA-F]{64}$/.test(key)) {
    wallet = privateKeyToAccount(key as `0x${string}`).address;
    try {
      const client = createPublicClient({ transport: http(chain.rpcUrl, { timeout: 6000 }) });
      const raw = await client.readContract({ address: chain.assetAddress, abi: erc20Abi, functionName: "balanceOf", args: [wallet as `0x${string}`] });
      balance = formatUnits(raw, chain.assetDecimals);
    } catch {
      balance = null;
    }
  }
  return NextResponse.json(
    {
      network: chain.label,
      caip2: chain.network,
      asset: chain.assetSymbol,
      explorer: chain.explorer,
      wallet,
      walletUrl: wallet ? addressUrl(chain, wallet) : null,
      balance,
      servConfigured: !!cfg.apiKey,
      model: servModelId(cfg),
      features: servFeatures(cfg),
      policy: POLICY_VERSION,
      receiptSigner: receiptSigner(),
      checkPriceUsd: (process.env.CHECK_PRICE_USD ?? "").trim() || "0.005",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
