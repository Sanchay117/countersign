/**
 * The exact checks. Arithmetic, limits and lookups are done here in code and
 * never handed to a model; SERV Reasoning only gets the judgment calls
 * (see policy.ts). A failed rule blocks the payment without spending a token.
 */
import { atomicToUsd, kiteChainByNetwork, usdToAtomic } from "./kite";
import type { Check, Facts, Mandate, PaymentAttempt } from "./types";

export interface RuleResult {
  checks: Check[];
  facts: Facts;
  /** True when at least one rule failed. */
  failed: boolean;
}

const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function runRules(mandate: Mandate, attempt: PaymentAttempt): RuleResult {
  const checks: Check[] = [];
  const add = (id: Check["id"], ok: boolean, evidence: string) => checks.push({ id, by: "rule", status: ok ? "pass" : "fail", evidence });

  const c = attempt.challenge;
  const chain = kiteChainByNetwork(c.network);
  const history = attempt.history ?? [];
  const now = attempt.at ? Date.parse(attempt.at) : Date.now();

  // 1. Network and asset: only the stablecoin Kite's facilitator settles has a known value.
  const assetOk = !!chain && same(c.asset, chain.assetAddress) && c.scheme === "exact";
  if (!chain) add("network_asset", false, `Network ${c.network} is not a Kite network.`);
  else if (c.scheme !== "exact") add("network_asset", false, `Payment scheme "${c.scheme}" is not the exact scheme Kite settles.`);
  else if (!same(c.asset, chain.assetAddress)) add("network_asset", false, `Asset ${c.asset} is not ${chain.assetSymbol}, the settlement stablecoin on ${chain.label}.`);
  else add("network_asset", true, `${chain.assetSymbol} on ${chain.label}.`);

  const decimals = chain?.assetDecimals ?? 18;
  let amount: bigint | null = null;
  try {
    if (!/^\d+$/.test(c.amount)) throw new Error("not an integer");
    amount = BigInt(c.amount);
    if (amount <= 0n) throw new Error("not positive");
  } catch {
    amount = null;
  }
  const amountUsd = assetOk && amount !== null ? atomicToUsd(amount, decimals) : null;

  const toAtomic = (usd: string): bigint | null => {
    try {
      return usdToAtomic(usd, decimals);
    } catch {
      return null;
    }
  };

  let spent = 0n;
  for (const p of history) spent += toAtomic(p.amountUsd) ?? 0n;
  const perPayment = toAtomic(mandate.maxPerPaymentUsd);
  const total = toAtomic(mandate.maxTotalUsd);

  // 2. Per-payment limit.
  if (amountUsd === null || amount === null) add("per_payment_limit", false, "The amount cannot be valued, so it cannot be checked against the limit.");
  else if (perPayment === null) add("per_payment_limit", false, `The mandate's per-payment limit "${mandate.maxPerPaymentUsd}" is not a valid amount.`);
  else add("per_payment_limit", amount <= perPayment, `$${amountUsd} against a per-payment limit of $${mandate.maxPerPaymentUsd}.`);

  // 3. Session budget.
  let remainingAfter: string | null = null;
  if (amountUsd === null || amount === null) add("budget", false, "The amount cannot be valued, so it cannot be checked against the budget.");
  else if (total === null) add("budget", false, `The mandate's budget "${mandate.maxTotalUsd}" is not a valid amount.`);
  else {
    const after = total - spent - amount;
    remainingAfter = atomicToUsd(after, decimals);
    add("budget", after >= 0n, `$${atomicToUsd(spent, decimals)} spent so far plus $${amountUsd}, against a budget of $${mandate.maxTotalUsd}.`);
  }

  // 4. Session window.
  if (mandate.expiresAt) {
    const end = Date.parse(mandate.expiresAt);
    if (Number.isNaN(end)) add("session", false, `The session end "${mandate.expiresAt}" is not a valid time.`);
    else add("session", now <= end, now <= end ? "Inside the approved session window." : `The session ended at ${mandate.expiresAt}.`);
  } else add("session", true, "No session end set.");

  // 5. Quote: the paywall may not ask for more than the listing showed.
  const quoted = attempt.listing?.quotedPriceUsd;
  let overQuote: string | null = null;
  if (!quoted) add("quote", true, "No earlier quote to compare against.");
  else {
    const q = toAtomic(quoted);
    if (q === null) add("quote", false, `The quoted price "${quoted}" is not a valid amount.`);
    else if (amount === null || amountUsd === null) add("quote", false, `Quoted $${quoted}, but the amount asked cannot be valued.`);
    else {
      overQuote = atomicToUsd(amount - q, decimals);
      add("quote", amount <= q, amount <= q ? `Asks $${amountUsd}, quoted $${quoted}.` : `Asks $${amountUsd} but the listing quoted $${quoted}: $${overQuote} more.`);
    }
  }

  // 6. Payee: must be the address the catalog registered for this merchant.
  const registered = attempt.listing?.payTo;
  const payeeMatches = registered ? same(registered, c.payTo) : null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(c.payTo)) add("payee", false, `"${c.payTo}" is not a valid address.`);
  else if (registered) add("payee", !!payeeMatches, payeeMatches ? "Pays the address registered for this merchant." : `Pays ${c.payTo}, but the catalog registered ${registered} for this merchant.`);
  else add("payee", true, "No registered payee to compare against.");

  const facts: Facts = {
    amountUsd,
    assetSymbol: chain?.assetSymbol ?? null,
    networkLabel: chain?.label ?? null,
    resourceHost: hostOf(attempt.resourceUrl),
    quotedPriceUsd: quoted ?? null,
    overQuoteUsd: overQuote,
    spentBeforeUsd: atomicToUsd(spent, decimals),
    remainingAfterUsd: remainingAfter,
    payeeMatchesListing: payeeMatches,
    priorPaymentsToPayee: history.filter((p) => same(p.payTo, c.payTo)).length,
    priorPaymentsForResource: history.filter((p) => p.resourceUrl === attempt.resourceUrl).length,
  };

  return { checks, facts, failed: checks.some((k) => k.status === "fail") };
}
