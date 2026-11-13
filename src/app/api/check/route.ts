/**
 * POST /api/check: the same verdict as /v1/check, free and rate limited, for
 * the website's live demo. Accepts { caseId } to run a case from the trap
 * suite, or { mandate, attempt } for a payment of your own.
 */
import { NextRequest, NextResponse } from "next/server";
import { CASES } from "@/lib/cases";
import { countersign, validateInput } from "@/lib/countersign";
import { allow, clientIp } from "@/lib/http";
import type { Mandate, PaymentAttempt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const num = (v: string | undefined, d: number) => Number(v ?? "") || d;

export async function POST(request: NextRequest) {
  let body: { caseId?: string; mandate?: Mandate; attempt?: PaymentAttempt };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  let mandate: Mandate;
  let attempt: PaymentAttempt;
  if (typeof body.caseId === "string") {
    const c = CASES.find((k) => k.id === body.caseId);
    if (!c) return NextResponse.json({ error: `unknown case ${body.caseId}` }, { status: 404 });
    ({ mandate, attempt } = c);
  } else {
    const problem = validateInput(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    mandate = body.mandate!;
    attempt = body.attempt!;
  }

  const ip = clientIp(request);
  const perMinute = allow(`check:m:${ip}`, num(process.env.DEMO_PER_MINUTE, 10), 60_000);
  const perDay = allow(`check:d:${ip}`, num(process.env.DEMO_PER_DAY, 80), 86_400_000);
  const global = allow("check:global", num(process.env.DEMO_GLOBAL_PER_DAY, 1500), 86_400_000);
  const limited = [perMinute, perDay, global].find((l) => !l.ok);
  if (limited) return NextResponse.json({ error: "The live demo is rate limited. Try again shortly.", retryAfterSeconds: limited.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });

  const receipt = await countersign(mandate, attempt);
  return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
}
