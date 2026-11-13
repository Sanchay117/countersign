/** The market catalog: what an agent sees before it reaches any paywall. Free. */
import { NextRequest, NextResponse } from "next/server";
import { originOf } from "@/lib/http";
import { SHOPS, toListing } from "@/lib/market";
import { activeChain } from "@/lib/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = originOf(request);
  const chain = activeChain();
  return NextResponse.json({
    network: chain.network,
    asset: chain.assetSymbol,
    listings: SHOPS.map((s) => ({ id: s.id, category: s.category, params: s.params, ...toListing(origin, s) })),
  });
}
