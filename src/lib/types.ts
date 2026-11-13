/** What the owner asked the agent to do, plus the spending limits they approved. */
export interface Mandate {
  /** The task in the owner's own words. The only source of authority. */
  task: string;
  /** Per-payment cap in USD, e.g. "0.05". Mirrors a Kite Passport session's max-amount-per-tx. */
  maxPerPaymentUsd: string;
  /** Total session budget in USD. Mirrors max-total-amount. */
  maxTotalUsd: string;
  /** ISO time the session ends. Mirrors the session TTL. */
  expiresAt?: string;
}

/** One x402 payment option, as the merchant sent it in the 402 challenge. */
export interface Challenge {
  scheme: string;
  /** CAIP-2 network, e.g. "eip155:2368". */
  network: string;
  /** Token contract address. */
  asset: string;
  /** Amount in the token's atomic units, as a decimal string. */
  amount: string;
  payTo: string;
  /** Text the merchant attached to the challenge. Untrusted. */
  description?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

/** What the agent saw before it reached the paywall: a catalog entry, search hit or quote. */
export interface Listing {
  merchant: string;
  title: string;
  description?: string;
  url?: string;
  /** The price shown before the paywall, in USD. */
  quotedPriceUsd?: string;
  /** The payee the catalog registered for this merchant, when there is one. */
  payTo?: string;
}

/** A payment already made in this session. */
export interface PastPayment {
  resourceUrl: string;
  payTo: string;
  amountUsd: string;
  /** ISO time. */
  at: string;
}

/** Everything known about the payment the agent is about to sign. */
export interface PaymentAttempt {
  resourceUrl: string;
  method?: string;
  challenge: Challenge;
  listing?: Listing;
  /** Other options the agent saw for the same need. */
  alternatives?: Listing[];
  /** The agent's own explanation for paying. Evidence, not authority. */
  agentNote?: string;
  /** Text the agent read on the way here (pages, tool output, seller messages). Untrusted. */
  context?: string;
  /** Payments already made in this session. */
  history?: PastPayment[];
  /** ISO time of the attempt. Defaults to now. */
  at?: string;
}

export type Decision = "sign" | "hold" | "block";
export type CheckStatus = "pass" | "warn" | "fail";

/** Checks done by code: exact arithmetic and lookups. */
export type RuleCheckId = "network_asset" | "per_payment_limit" | "budget" | "session" | "quote" | "payee";
/** Checks done by SERV Reasoning: judgment. */
export type ReasonedCheckId = "purpose" | "merchant" | "instruction_origin" | "terms" | "value";
export type CheckId = RuleCheckId | ReasonedCheckId;

export interface Check {
  id: CheckId;
  by: "rule" | "serv";
  status: CheckStatus;
  evidence: string;
}

/** Numbers and lookups computed by code and handed to the model as facts. */
export interface Facts {
  amountUsd: string | null;
  assetSymbol: string | null;
  networkLabel: string | null;
  resourceHost: string | null;
  quotedPriceUsd: string | null;
  /** amount minus quote, in USD. Positive means the paywall asks more than the listing showed. */
  overQuoteUsd: string | null;
  spentBeforeUsd: string;
  remainingAfterUsd: string | null;
  payeeMatchesListing: boolean | null;
  priorPaymentsToPayee: number;
  priorPaymentsForResource: number;
}

export interface ServMeta {
  called: boolean;
  model?: string;
  features?: string[];
  requestId?: string | null;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Token cost at the catalog price. SERV may bill guard and validation steps on top. */
  estCostUsd?: number;
  /** True when SERV's prompt guard refused the request before any model ran. */
  guardTripped?: boolean;
  finishReason?: string | null;
  error?: string;
}

export interface Verdict {
  decision: Decision;
  summary: string;
  checks: Check[];
  facts: Facts;
  serv: ServMeta;
}

/** A verdict bound to one exact payment and signed by Countersign. */
export interface Receipt extends Verdict {
  version: "countersign/1";
  policyVersion: string;
  /** keccak256 over the canonical mandate and attempt. */
  attemptDigest: `0x${string}`;
  binding: {
    chainId: number;
    asset: string;
    payTo: string;
    amount: string;
    resource: string;
  };
  issuedAt: number;
  /** A "sign" verdict is only good until this time (unix seconds). */
  expiresAt: number;
  signer: `0x${string}`;
  signature: `0x${string}`;
}
