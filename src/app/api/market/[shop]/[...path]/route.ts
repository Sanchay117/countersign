/**
 * The demo merchants. Each shop is a real x402 endpoint on Kite: an unpaid
 * request gets a 402 challenge, a paid one is settled through Kite's
 * facilitator, and only after the upstream data came back.
 */
import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { BadRequest, serveShop, shopById, type Shop } from "@/lib/market";
import { activeChain, resourceServer } from "@/lib/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Handler = (request: NextRequest) => Promise<NextResponse<unknown>>;
const handlers = new Map<string, Handler>();

function shopFromPath(pathname: string): { shop: Shop | undefined; rest: string } {
  const parts = pathname.split("/").filter(Boolean); // api, market, <shop>, ...rest
  return { shop: shopById(parts[2] ?? ""), rest: parts.slice(3).join("/") };
}

function paidHandler(shop: Shop): Handler {
  let h = handlers.get(shop.id);
  if (!h) {
    const serve: Handler = async (request) => {
      try {
        return NextResponse.json(await serveShop(shop, request.nextUrl.searchParams), { headers: { "Cache-Control": "no-store" } });
      } catch (err) {
        // Any status of 400 or above means the payment is not settled.
        if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
        return NextResponse.json({ error: "upstream unavailable", detail: (err as Error).message }, { status: 502 });
      }
    };
    h = withX402(
      serve,
      {
        accepts: { scheme: "exact", price: `$${shop.chargePriceUsd}`, network: activeChain().network, payTo: shop.chargePayTo, maxTimeoutSeconds: 60 },
        description: shop.challengeDescription,
        mimeType: "application/json",
        serviceName: shop.merchant,
      },
      resourceServer(),
    );
    handlers.set(shop.id, h);
  }
  return h;
}

async function handle(request: NextRequest): Promise<NextResponse<unknown>> {
  const { shop, rest } = shopFromPath(request.nextUrl.pathname);
  if (!shop || rest !== shop.path) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return paidHandler(shop)(request);
}

export const GET = handle;
export const POST = handle;
