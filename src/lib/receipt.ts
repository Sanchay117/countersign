/**
 * Signed receipts. Every verdict is bound to one exact payment (payee, asset,
 * amount, resource) and signed with EIP-712, so anyone can check later that
 * Countersign approved this payment and not a different one.
 */
import { keccak256, stringToHex, verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { kiteChainByNetwork } from "./kite";
import { POLICY_VERSION } from "./policy";
import type { Mandate, PaymentAttempt, Receipt, Verdict } from "./types";

/** How long a "sign" verdict stays valid. The payment must be signed inside this window. */
export const RECEIPT_TTL_SECONDS = 300;

export const RECEIPT_TYPES = {
  Verdict: [
    { name: "attemptDigest", type: "bytes32" },
    { name: "decision", type: "string" },
    { name: "payTo", type: "string" },
    { name: "asset", type: "string" },
    { name: "amount", type: "string" },
    { name: "resource", type: "string" },
    { name: "policyVersion", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export const receiptDomain = (chainId: number) => ({ name: "Countersign", version: "1", chainId }) as const;

/** JSON with sorted keys, so the same input always hashes to the same digest. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export function attemptDigest(mandate: Mandate, attempt: PaymentAttempt): `0x${string}` {
  return keccak256(stringToHex(canonical({ mandate, attempt })));
}

let ephemeral: `0x${string}` | null = null;
function signerKey(): `0x${string}` {
  const k = (process.env.COUNTERSIGN_PRIVATE_KEY ?? "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(k)) return k as `0x${string}`;
  // No key configured: sign with a per-process key so the flow still works in development.
  if (!ephemeral) ephemeral = generatePrivateKey();
  return ephemeral;
}

export function receiptSigner(): `0x${string}` {
  return privateKeyToAccount(signerKey()).address;
}

function message(r: Pick<Receipt, "attemptDigest" | "decision" | "binding" | "policyVersion" | "issuedAt" | "expiresAt">) {
  return {
    attemptDigest: r.attemptDigest,
    decision: r.decision,
    payTo: r.binding.payTo,
    asset: r.binding.asset,
    amount: r.binding.amount,
    resource: r.binding.resource,
    policyVersion: r.policyVersion,
    issuedAt: BigInt(r.issuedAt),
    expiresAt: BigInt(r.expiresAt),
  };
}

export async function signReceipt(verdict: Verdict, mandate: Mandate, attempt: PaymentAttempt, nowMs = Date.now()): Promise<Receipt> {
  const account = privateKeyToAccount(signerKey());
  const c = attempt.challenge;
  const issuedAt = Math.floor(nowMs / 1000);
  const base = {
    ...verdict,
    version: "countersign/1" as const,
    policyVersion: POLICY_VERSION,
    attemptDigest: attemptDigest(mandate, attempt),
    binding: {
      chainId: kiteChainByNetwork(c.network)?.chainId ?? 0,
      asset: c.asset,
      payTo: c.payTo,
      amount: c.amount,
      resource: attempt.resourceUrl,
    },
    issuedAt,
    expiresAt: issuedAt + RECEIPT_TTL_SECONDS,
    signer: account.address,
  };
  const signature = await account.signTypedData({
    domain: receiptDomain(base.binding.chainId),
    types: RECEIPT_TYPES,
    primaryType: "Verdict",
    message: message(base),
  });
  return { ...base, signature };
}

/** True when the receipt was signed by `expectedSigner` (or by its own stated signer) and not altered. */
export async function verifyReceipt(r: Receipt, expectedSigner?: `0x${string}`): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: expectedSigner ?? r.signer,
      domain: receiptDomain(r.binding.chainId),
      types: RECEIPT_TYPES,
      primaryType: "Verdict",
      message: message(r),
      signature: r.signature,
    });
  } catch {
    return false;
  }
}

/** Does a receipt authorize signing exactly this payment, right now? */
export function receiptCovers(r: Receipt, challenge: { asset: string; payTo: string; amount: string }, nowMs = Date.now()): boolean {
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return r.decision === "sign" && eq(r.binding.asset, challenge.asset) && eq(r.binding.payTo, challenge.payTo) && r.binding.amount === challenge.amount && Math.floor(nowMs / 1000) <= r.expiresAt;
}
