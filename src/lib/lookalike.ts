/**
 * Exact string comparisons between the merchant being paid and the other
 * merchants the agent saw. Spotting that two names are one letter apart is
 * arithmetic, so it is done here in code and handed to SERV as a fact.
 * Whether the resemblance is an imitation or an innocent coincidence is a
 * judgment call, and stays with SERV.
 */
import { domainToUnicode } from "node:url";
import type { Listing, PaymentAttempt } from "./types";

/** Characters that render like a Latin letter but are not one. */
const CONFUSABLE: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "т": "t", "к": "k", "м": "m", "н": "h", "в": "b",
  "α": "a", "ο": "o", "ρ": "p", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "τ": "t",
  "0": "o", "1": "l",
};

/** Lowercase letters and digits only. */
export function plain(s: string): string {
  return s.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** What a name looks like at a glance: look-alike characters and letter pairs folded together. */
export function skeleton(s: string): string {
  let out = "";
  for (const ch of plain(s)) out += CONFUSABLE[ch] ?? ch;
  return out.replace(/rn/g, "m").replace(/vv/g, "w").replace(/cl/g, "d");
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = keep;
    }
  }
  return prev[b.length];
}

/** The name part of a host: "api.open-meteo.example" -> "open-meteo". Punycode is decoded first. */
export function hostName(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = domainToUnicode(new URL(url).hostname).toLowerCase();
    const labels = host.split(".").filter(Boolean);
    if (labels.length < 2) return labels[0] ?? null;
    return labels[labels.length - 2];
  } catch {
    return null;
  }
}

/**
 * How `a` looks like a copy of `b`, or null when it does not. Direction matters: the copy is the
 * name that carries the trick (a letter from another alphabet, "rn" standing in for "m", extra
 * words bolted on). The name being copied gets null here, so an honest merchant is never flagged
 * for having an impostor.
 */
export function resemblance(a: string, b: string): string | null {
  const pa = plain(a);
  const pb = plain(b);
  if (!pa || !pb || pa === pb) return null;
  if (skeleton(a) === skeleton(b)) {
    if (/[^\x00-\x7f]/.test(a)) return "uses look-alike characters to read the same as";
    // Only the name that needed folding is the look-alike. If neither or both did, it cannot be told apart here.
    const aFolded = skeleton(a) !== pa;
    const bFolded = skeleton(b) !== pb;
    if (aFolded && !bFolded) return "reads the same at a glance as";
    if (!aFolded && bFolded) return null;
    return "reads the same at a glance as";
  }
  if (pb.length >= 6 && pa.length > pb.length && pa.includes(pb)) return "contains, with words added, the name of";
  if (pa.length >= 6 && pb.length > pa.length && pb.includes(pa)) return null;
  if (Math.min(pa.length, pb.length) >= 6 && editDistance(pa, pb) <= 2) return "is one or two letters away from";
  return null;
}

/** Plain-language notes on every resemblance between this payee and the alternatives the agent saw. */
export function lookalikes(attempt: PaymentAttempt): string[] {
  const notes = new Set<string>();
  const mine: { kind: string; value: string }[] = [];
  if (attempt.listing?.merchant) mine.push({ kind: "merchant name", value: attempt.listing.merchant });
  const host = hostName(attempt.resourceUrl);
  if (host) mine.push({ kind: "host", value: host });

  const others: Listing[] = attempt.alternatives ?? [];
  for (const other of others) {
    const theirs: { kind: string; value: string }[] = [{ kind: "merchant name", value: other.merchant }];
    const theirHost = hostName(other.url);
    if (theirHost) theirs.push({ kind: "host", value: theirHost });
    for (const m of mine)
      for (const t of theirs) {
        if (m.kind !== t.kind) continue;
        const how = resemblance(m.value, t.value);
        if (how) {
          notes.add(`The ${m.kind} "${m.value}" ${how} "${t.value}", another merchant the agent saw.`);
          continue;
        }
        // The other way round: this payee is the name being copied. Said plainly, so it is not read as a mark against it.
        const copied = resemblance(t.value, m.value);
        if (copied) notes.add(`Another merchant the agent saw, "${t.value}", ${copied} this payee's ${m.kind}, "${m.value}". This payee is the one being copied.`);
      }
  }
  return [...notes];
}
