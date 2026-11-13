/**
 * Countersign: the second signature on every agent payment.
 *
 *   rules (code)  ->  judgment (SERV Reasoning)  ->  signed receipt
 *
 * The decision rule is fixed and lives in code, not in the model:
 *   any failed check blocks, any warning holds, and only five clean passes sign.
 * If SERV cannot be reached the payment is held, never signed.
 */
import { buildUserMessage } from "./policy";
import { signReceipt } from "./receipt";
import { runRules } from "./rules";
import { judge, servConfigFromEnv, type Judgment, type ServConfig } from "./serv";
import type { Check, Decision, Mandate, PaymentAttempt, Receipt, Verdict } from "./types";

const RANK: Record<Decision, number> = { sign: 0, hold: 1, block: 2 };

/** The fixed rule that turns check results into a decision. */
export function decide(checks: Check[]): Decision {
  if (checks.some((c) => c.status === "fail")) return "block";
  if (checks.some((c) => c.status === "warn")) return "hold";
  return "sign";
}

const stricter = (a: Decision, b: Decision): Decision => (RANK[a] >= RANK[b] ? a : b);

export interface CheckOptions {
  serv?: ServConfig;
  /** Swap the SERV call out, for tests. */
  judgeFn?: (userMessage: string, cfg: ServConfig) => Promise<Judgment>;
}

/** Runs the rules and, when they pass, the SERV judgment. Returns an unsigned verdict. */
export async function evaluate(mandate: Mandate, attempt: PaymentAttempt, opts: CheckOptions = {}): Promise<Verdict> {
  const rules = runRules(mandate, attempt);

  if (rules.failed) {
    const first = rules.checks.find((c) => c.status === "fail")!;
    return {
      decision: "block",
      summary: `Blocked by an exact check, before any model was asked: ${first.evidence}`,
      checks: rules.checks,
      facts: rules.facts,
      serv: { called: false },
    };
  }

  const cfg = opts.serv ?? servConfigFromEnv();
  const run = opts.judgeFn ?? judge;
  const message = buildUserMessage(mandate, attempt, rules.facts);
  const j = await run(message, cfg);

  if (j.checks && j.decision && j.summary) {
    const checks = [...rules.checks, ...j.checks];
    const decision = stricter(decide(checks), j.decision);
    return { decision, summary: j.summary, checks, facts: rules.facts, serv: j.meta };
  }

  if (j.meta.guardTripped) {
    // SERV's prompt guard refused the request before any model ran. A payment the guard refused is
    // never signed. To tell the owner why, the request is judged once more without the guard; the
    // guard's refusal then counts as at least a warning on the origin check, so the best outcome is a hold.
    const note = "SERV's prompt guard refused this request on first reading: text in it reads as an attempt to override the checker.";
    const second = await run(message, { ...cfg, guard: false });
    if (second.checks && second.decision && second.summary) {
      const judged = second.checks.map((c): Check => (c.id !== "instruction_origin" ? c : c.status === "pass" ? { ...c, status: "warn", evidence: note } : { ...c, evidence: `${c.evidence} ${note}` }));
      const checks = [...rules.checks, ...judged];
      return {
        decision: stricter(decide(checks), second.decision),
        summary: second.summary,
        checks,
        facts: rules.facts,
        serv: { ...second.meta, guardTripped: true, features: j.meta.features, latencyMs: (j.meta.latencyMs ?? 0) + (second.meta.latencyMs ?? 0) },
      };
    }
    const guard: Check = { id: "instruction_origin", by: "serv", status: "fail", evidence: note };
    return {
      decision: "block",
      summary: "Blocked: text in this request tried to give the checker instructions, and SERV's prompt guard stopped it.",
      checks: [...rules.checks, guard],
      facts: rules.facts,
      serv: j.meta,
    };
  }

  // SERV could not give a verdict. Fail closed: a human looks, nothing is signed.
  return {
    decision: "hold",
    summary: `Held: the payment could not be checked (${j.meta.error ?? "no verdict"}). Nothing was signed.`,
    checks: rules.checks,
    facts: rules.facts,
    serv: j.meta,
  };
}

/** Evaluates a payment and returns a signed receipt bound to it. */
export async function countersign(mandate: Mandate, attempt: PaymentAttempt, opts: CheckOptions = {}): Promise<Receipt> {
  const verdict = await evaluate(mandate, attempt, opts);
  return signReceipt(verdict, mandate, attempt);
}

/** Basic shape validation for requests that arrive over HTTP. Returns an error message or null. */
export function validateInput(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be a JSON object with mandate and attempt";
  const { mandate, attempt } = body as { mandate?: Partial<Mandate>; attempt?: Partial<PaymentAttempt> };
  if (!mandate || typeof mandate !== "object") return "mandate is required";
  if (typeof mandate.task !== "string" || !mandate.task.trim()) return "mandate.task is required";
  if (mandate.task.length > 2000) return "mandate.task is too long (2000 characters max)";
  if (typeof mandate.maxPerPaymentUsd !== "string") return "mandate.maxPerPaymentUsd must be a decimal string";
  if (typeof mandate.maxTotalUsd !== "string") return "mandate.maxTotalUsd must be a decimal string";
  if (!attempt || typeof attempt !== "object") return "attempt is required";
  if (typeof attempt.resourceUrl !== "string" || !attempt.resourceUrl) return "attempt.resourceUrl is required";
  const c = attempt.challenge;
  if (!c || typeof c !== "object") return "attempt.challenge is required";
  for (const k of ["scheme", "network", "asset", "amount", "payTo"] as const) if (typeof c[k] !== "string") return `attempt.challenge.${k} must be a string`;
  if (attempt.history !== undefined && !Array.isArray(attempt.history)) return "attempt.history must be an array";
  if (JSON.stringify(body).length > 24000) return "request is too large (24 KB max)";
  return null;
}
