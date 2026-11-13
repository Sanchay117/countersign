/**
 * POST /v1/check: the paid Countersign API.
 *
 * A Kite x402 service like any other in the catalog: an unpaid request gets a
 * 402 challenge, a Kite Passport agent pays it from its spending session, and
 * the payment is settled only after a verdict was produced. Bad input (400)
 * and a SERV outage (503) are never charged.
 */
import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { countersign, validateInput } from "@/lib/countersign";
import { receiptSigner } from "@/lib/receipt";
import { activeChain, resourceServer } from "@/lib/x402";
import type { Mandate, PaymentAttempt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const checkPriceUsd = () => (process.env.CHECK_PRICE_USD ?? "").trim() || "0.005";
const payTo = () => (process.env.COUNTERSIGN_PAY_TO ?? "").trim() || receiptSigner();

async function check(request: NextRequest): Promise<NextResponse<unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const problem = validateInput(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const { mandate, attempt } = body as { mandate: Mandate; attempt: PaymentAttempt };
  const receipt = await countersign(mandate, attempt);
  // A verdict that could not be produced is not a product. Do not charge for it.
  if (receipt.serv.called && receipt.serv.error && !receipt.serv.guardTripped) return NextResponse.json({ error: "verdict unavailable", detail: receipt.serv.error }, { status: 503 });
  return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
}

let paid: ((request: NextRequest) => Promise<NextResponse<unknown>>) | null = null;

export async function POST(request: NextRequest) {
  paid ??= withX402(
    check,
    {
      accepts: { scheme: "exact", price: `$${checkPriceUsd()}`, network: activeChain().network, payTo: payTo(), maxTimeoutSeconds: 120 },
      description: "Countersign: checks one agent payment against the owner's mandate and returns a signed sign, hold or block verdict",
      mimeType: "application/json",
      serviceName: "Countersign",
    },
    resourceServer(),
  );
  return paid(request);
}
