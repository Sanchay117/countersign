/**
 * x402 on Kite, both sides.
 *
 * Seller side: a resource server wired to Kite's facilitator, used by the paid
 * Countersign API and by the demo merchants.
 *
 * Buyer side: an x402 client whose wallet will not sign until Countersign has
 * approved the exact payment. The guard sits in the SDK's own
 * onBeforePaymentCreation hook, which runs after the merchant's 402 challenge
 * arrives and before the EIP-3009 authorization is signed.
 */
import { x402Client } from "@x402/core/client";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme as ExactEvmClient } from "@x402/evm/exact/client";
import { ExactEvmScheme as ExactEvmServer } from "@x402/evm/exact/server";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { countersign, type CheckOptions } from "./countersign";
import { FACILITATOR_URL, kiteChainByName, kiteMoneyParser, usdToAtomic, type KiteChain } from "./kite";
import { signReceipt } from "./receipt";
import { LIMIT_RULES, runRules } from "./rules";
import type { Listing, Mandate, PastPayment, PaymentAttempt, Receipt, RuleCheckId } from "./types";

export const activeChain = (): KiteChain => kiteChainByName(process.env.KITE_NETWORK);

let server: x402ResourceServer | null = null;
/** One resource server per process, registered for the active Kite network. */
export function resourceServer(): x402ResourceServer {
  if (!server) {
    const chain = activeChain();
    const facilitator = new HTTPFacilitatorClient({ url: (process.env.FACILITATOR_URL ?? "").trim() || FACILITATOR_URL });
    server = new x402ResourceServer(facilitator).register(chain.network, new ExactEvmServer().registerMoneyParser(kiteMoneyParser(chain)));
  }
  return server;
}

/** What the agent knows about the purchase beyond the 402 challenge itself. */
export interface PayIntent {
  listing?: Listing;
  alternatives?: Listing[];
  agentNote?: string;
  context?: string;
}

export type GuardMode = "countersign" | "limits";

export { LIMIT_RULES };

export interface PayOptions {
  buyerKey: `0x${string}`;
  mandate: Mandate;
  history: PastPayment[];
  intent: PayIntent;
  mode: GuardMode;
  check?: CheckOptions;
  fetchImpl?: typeof fetch;
}

export interface PayResult {
  /** paid: settled on-chain. stopped: the wallet refused to sign. failed: signed, but the merchant or facilitator rejected it. */
  outcome: "paid" | "stopped" | "failed" | "free";
  httpStatus?: number;
  body?: unknown;
  /** Present whenever a 402 challenge was evaluated. */
  receipt?: Receipt;
  challenge?: PaymentAttempt["challenge"];
  settlement?: { transaction: string; network: string; payer?: string };
  error?: string;
}

function toAttempt(url: string, method: string, required: PaymentRequired, selected: PaymentRequirements, opts: PayOptions): PaymentAttempt {
  return {
    resourceUrl: required.resource?.url || url,
    method,
    challenge: {
      scheme: selected.scheme,
      network: selected.network,
      asset: selected.asset,
      amount: selected.amount,
      payTo: selected.payTo,
      description: required.resource?.description,
      maxTimeoutSeconds: selected.maxTimeoutSeconds,
      extra: selected.extra,
    },
    ...opts.intent,
    history: opts.history,
    at: new Date().toISOString(),
  };
}

/** Limits-only verdict: what a wallet with spending limits and nothing else would do. */
async function limitsOnly(mandate: Mandate, attempt: PaymentAttempt): Promise<Receipt> {
  const r = runRules(mandate, attempt);
  const checks = r.checks.filter((c) => LIMIT_RULES.includes(c.id as RuleCheckId));
  const failed = checks.find((c) => c.status === "fail");
  return signReceipt(
    {
      decision: failed ? "block" : "sign",
      summary: failed ? `Over a spending limit: ${failed.evidence}` : "Inside the spending limits. Nothing else was checked.",
      checks,
      facts: r.facts,
      serv: { called: false },
    },
    mandate,
    attempt,
  );
}

/**
 * Calls a paid URL. If it answers 402, the challenge is checked first and the
 * wallet only signs when the verdict is "sign".
 */
export async function payGuarded(url: string, init: RequestInit, opts: PayOptions): Promise<PayResult> {
  const chain = activeChain();
  const account = privateKeyToAccount(opts.buyerKey);
  const method = (init.method ?? "GET").toUpperCase();
  const result: PayResult = { outcome: "free" };

  const client = new x402Client().register(chain.network, new ExactEvmClient(account));
  // The SDK's own per-payment cap, set to the session limit. pieUSD and USDC.e on Kite are not in
  // the SDK's default asset table, so they are allowed explicitly with an atomic cap.
  client.setSpendControls({
    allowedAssets: [{ network: chain.network, asset: chain.assetAddress, maxAmountPerPayment: usdToAtomic(opts.mandate.maxPerPaymentUsd, chain.assetDecimals).toString() }],
  });

  client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements }) => {
    const attempt = toAttempt(url, method, paymentRequired, selectedRequirements, opts);
    result.challenge = attempt.challenge;
    result.receipt = opts.mode === "countersign" ? await countersign(opts.mandate, attempt, opts.check) : await limitsOnly(opts.mandate, attempt);
    if (result.receipt.decision !== "sign") return { abort: true, reason: result.receipt.summary };
  });

  const pay = wrapFetchWithPayment(opts.fetchImpl ?? fetch, client);
  let res: Response;
  try {
    res = await pay(url, init);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    if (result.receipt && result.receipt.decision !== "sign") return { ...result, outcome: "stopped", error: message };
    return { ...result, outcome: result.receipt ? "failed" : "stopped", error: message };
  }

  result.httpStatus = res.status;
  const text = await res.text();
  try {
    result.body = JSON.parse(text);
  } catch {
    result.body = text.slice(0, 2000);
  }
  const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  if (header) {
    try {
      const settle = decodePaymentResponseHeader(header);
      if (settle.success && settle.transaction) result.settlement = { transaction: settle.transaction, network: settle.network, payer: settle.payer };
      else result.error = settle.errorReason ?? settle.errorMessage ?? "settlement failed";
    } catch {
      result.error = "unreadable PAYMENT-RESPONSE header";
    }
  }
  if (result.settlement) result.outcome = "paid";
  else if (result.receipt) {
    result.outcome = "failed";
    const reason = (result.body as { error?: unknown } | null)?.error;
    result.error ??= typeof reason === "string" && reason ? reason : `merchant answered ${res.status} without settling`;
  } else result.outcome = "free";
  return result;
}
