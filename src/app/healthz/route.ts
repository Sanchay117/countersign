/** Free liveness check, as the Kite x402 service convention expects. */
import { NextResponse } from "next/server";
import { POLICY_VERSION } from "@/lib/policy";
import { receiptSigner } from "@/lib/receipt";
import { servConfigFromEnv, servModelId } from "@/lib/serv";
import { activeChain } from "@/lib/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const chain = activeChain();
  const cfg = servConfigFromEnv();
  return NextResponse.json({
    ok: true,
    service: "countersign",
    network: chain.network,
    asset: chain.assetSymbol,
    price: `$${(process.env.CHECK_PRICE_USD ?? "").trim() || "0.005"}`,
    paid_endpoint: "POST /v1/check",
    policy: POLICY_VERSION,
    receipt_signer: receiptSigner(),
    serv: { configured: !!cfg.apiKey, model: servModelId(cfg) },
  });
}
