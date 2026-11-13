/**
 * Kite network constants and the money parser for x402 pricing.
 *
 * The chain table and kiteMoneyParser follow the official template in
 * gokite-ai/kite-x402-services (templates/typescript-express/src/kite.ts,
 * Apache-2.0), so a Countersign deployment settles exactly like any other
 * Kite x402 service.
 */
import type { AssetAmount, MoneyParser, Network } from "@x402/core/types";

export interface KiteChain {
  key: "mainnet" | "testnet";
  label: string;
  chainId: number;
  network: Network;
  rpcUrl: string;
  explorer: string;
  assetAddress: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  eip712Name: string;
  eip712Version: string;
}

/** Kite mainnet: Bridged USDC (USDC.e), 6 decimals. */
export const KITE_MAINNET: KiteChain = {
  key: "mainnet",
  label: "Kite Mainnet",
  chainId: 2366,
  network: "eip155:2366",
  rpcUrl: "https://rpc.gokite.ai",
  explorer: "https://kitescan.ai",
  assetAddress: "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e",
  assetSymbol: "USDC.e",
  assetDecimals: 6,
  eip712Name: "Bridged USDC (Kite AI)",
  eip712Version: "2",
};

/** Kite testnet: pieUSD, 18 decimals. Kite Passport sandbox agents pay with this. */
export const KITE_TESTNET: KiteChain = {
  key: "testnet",
  label: "Kite Testnet",
  chainId: 2368,
  network: "eip155:2368",
  rpcUrl: "https://rpc-testnet.gokite.ai",
  explorer: "https://testnet.kitescan.ai",
  assetAddress: "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A",
  assetSymbol: "pieUSD",
  assetDecimals: 18,
  eip712Name: "pieUSD",
  eip712Version: "1",
};

/** The x402 SDK appends /verify, /settle and /supported, so keep the /v2 prefix. */
export const FACILITATOR_URL = "https://facilitator.pieverse.io/v2";

export function kiteChainByName(name: string | undefined): KiteChain {
  switch ((name ?? "testnet").trim()) {
    case "mainnet":
      return KITE_MAINNET;
    case "":
    case "testnet":
      return KITE_TESTNET;
    default:
      throw new Error(`unknown KITE_NETWORK "${name}" (want mainnet or testnet)`);
  }
}

export function kiteChainByNetwork(network: string): KiteChain | null {
  if (network === KITE_MAINNET.network) return KITE_MAINNET;
  if (network === KITE_TESTNET.network) return KITE_TESTNET;
  return null;
}

/** Lets routes be priced as "$0.001" on Kite networks. Integer math only. */
export function kiteMoneyParser(chain: KiteChain): MoneyParser {
  return async (amount: string | number, network: Network): Promise<AssetAmount | null> => {
    if (network !== chain.network) return null;
    const text = typeof amount === "number" ? amount.toFixed(chain.assetDecimals) : amount.trim().replace(/^\$/, "");
    return {
      asset: chain.assetAddress,
      amount: usdToAtomic(text, chain.assetDecimals).toString(),
      extra: { name: chain.eip712Name, version: chain.eip712Version },
    };
  };
}

/** "0.015" -> atomic units, without floats. Throws on anything that is not a positive decimal. */
export function usdToAtomic(usd: string, decimals: number): bigint {
  const text = usd.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`not a decimal amount: ${usd}`);
  const [whole, frac = ""] = text.split(".");
  if (frac.length > decimals) throw new Error(`${usd} has more than ${decimals} decimals`);
  const units = BigInt(whole + frac.padEnd(decimals, "0"));
  if (units <= 0n) throw new Error(`amount must be positive: ${usd}`);
  return units;
}

/** Atomic units -> a plain decimal string such as "0.015". */
export function atomicToUsd(atomic: bigint | string, decimals: number): string {
  const v = BigInt(atomic);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function txUrl(chain: KiteChain, hash: string): string {
  return `${chain.explorer}/tx/${hash}`;
}

export function addressUrl(chain: KiteChain, address: string): string {
  return `${chain.explorer}/address/${address}`;
}
