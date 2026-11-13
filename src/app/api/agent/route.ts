/**
 * POST /api/agent: runs the shopping agent once and streams what happens as
 * server-sent events. Body: { task, mode } where mode is "countersign" or
 * "limits". The wallet is the demo's Kite testnet wallet; limits are fixed.
 */
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { DEMO_LIMITS, runAgent, type AgentEvent } from "@/lib/agent";
import { allow, clientIp, originOf } from "@/lib/http";
import type { Mandate } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const num = (v: string | undefined, d: number) => Number(v ?? "") || d;

function sse(event: AgentEvent | { type: "error"; message: string }): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  let body: { task?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  const task = (body.task ?? "").trim();
  if (!task || task.length > 400) return Response.json({ error: "task is required (400 characters max)" }, { status: 400 });
  const mode = body.mode === "limits" ? "limits" : "countersign";

  const key = (process.env.BUYER_PRIVATE_KEY ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return Response.json({ error: "The demo wallet is not configured (BUYER_PRIVATE_KEY)." }, { status: 503 });

  const ip = clientIp(request);
  const perHour = allow(`agent:h:${ip}`, num(process.env.AGENT_PER_HOUR, 12), 3_600_000);
  const global = allow("agent:global", num(process.env.AGENT_GLOBAL_PER_DAY, 400), 86_400_000);
  const limited = [perHour, global].find((l) => !l.ok);
  if (limited) return Response.json({ error: "The live agent is rate limited. Try again shortly.", retryAfterSeconds: limited.retryAfterSeconds }, { status: 429 });

  const mandate: Mandate = { task, ...DEMO_LIMITS, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  const account = privateKeyToAccount(key as `0x${string}`);
  const origin = originOf(request);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runAgent({ origin, mandate, mode, buyerKey: key as `0x${string}`, wallet: account.address })) controller.enqueue(sse(event));
      } catch (err) {
        controller.enqueue(sse({ type: "error", message: (err as Error).message ?? "the agent run failed" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" } });
}
