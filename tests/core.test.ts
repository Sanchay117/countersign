import assert from "node:assert/strict";
import { test } from "node:test";
import { CASES } from "../src/lib/cases";
import { countersign, decide, evaluate, validateInput } from "../src/lib/countersign";
import { atomicToUsd, usdToAtomic } from "../src/lib/kite";
import { buildUserMessage, SYSTEM_PROMPT } from "../src/lib/policy";
import { receiptCovers, verifyReceipt } from "../src/lib/receipt";
import { runRules } from "../src/lib/rules";
import { parseVerdict, servModelId, servTools, type Judgment, type ServConfig } from "../src/lib/serv";
import type { Check, Decision } from "../src/lib/types";

const cfg: ServConfig = { apiKey: "test", model: "gpt-5.4-mini", effort: "low", kronos: true, multipath: true, guard: true, shadow: true, shadowIterations: 3, timeoutMs: 1000 };

const allPass = (decision: Decision = "sign", over: Partial<Record<string, "pass" | "warn" | "fail">> = {}): Judgment => {
  const ids = ["purpose", "merchant", "instruction_origin", "terms", "value"] as const;
  const checks: Check[] = ids.map((id) => ({ id, by: "serv", status: over[id] ?? "pass", evidence: "test" }));
  return { checks, decision, summary: "test", meta: { called: true, model: "m" } };
};

const byId = (id: string) => CASES.find((c) => c.id === id)!;

test("money conversion is exact in both directions", () => {
  assert.equal(usdToAtomic("0.002", 18).toString(), "2000000000000000");
  assert.equal(usdToAtomic("0.002", 6).toString(), "2000");
  assert.equal(usdToAtomic("$1", 6).toString(), "1000000");
  assert.equal(atomicToUsd("2000000000000000", 18), "0.002");
  assert.equal(atomicToUsd(1500n, 6), "0.0015");
  assert.equal(atomicToUsd(-1000n, 6), "-0.001");
  assert.throws(() => usdToAtomic("0.0000001", 6));
  assert.throws(() => usdToAtomic("abc", 6));
  assert.throws(() => usdToAtomic("0", 6));
});

test("case ids are unique and every case is well formed", () => {
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
  for (const c of CASES) {
    assert.equal(validateInput({ mandate: c.mandate, attempt: c.attempt }), null, c.id);
    if (c.tier === "legit") assert.equal(c.expect, "sign", c.id);
    if (c.tier === "unclear") assert.equal(c.expect, "hold", c.id);
    if (["limits", "rules", "judgment"].includes(c.tier)) assert.equal(c.expect, "block", c.id);
  }
});

test("rules: every limits and rules case fails a rule, and names the right one", () => {
  const expectRule: Record<string, string> = { B01: "per_payment_limit", B02: "budget", B03: "session", B04: "network_asset", B05: "network_asset", R01: "quote", R02: "quote", R03: "payee", R04: "payee", R05: "quote" };
  for (const [id, rule] of Object.entries(expectRule)) {
    const c = byId(id);
    const r = runRules(c.mandate, c.attempt);
    assert.equal(r.failed, true, id);
    assert.ok(r.checks.some((k) => k.id === rule && k.status === "fail"), `${id} should fail ${rule}`);
  }
});

test("rules: no legit, unclear or judgment case trips a rule", () => {
  for (const c of CASES.filter((c) => ["legit", "unclear", "judgment"].includes(c.tier))) {
    const r = runRules(c.mandate, c.attempt);
    assert.equal(r.failed, false, `${c.id}: ${r.checks.find((k) => k.status === "fail")?.evidence}`);
  }
});

test("rules: facts carry the exact numbers", () => {
  const r = runRules(byId("L04").mandate, byId("L04").attempt);
  assert.equal(r.facts.amountUsd, "0.002");
  assert.equal(r.facts.spentBeforeUsd, "0.002");
  assert.equal(r.facts.remainingAfterUsd, "0.246");
  assert.equal(r.facts.priorPaymentsForResource, 1);
  assert.equal(r.facts.payeeMatchesListing, true);
  const m = runRules(byId("L12").mandate, byId("L12").attempt);
  assert.equal(m.facts.amountUsd, "0.002");
  assert.equal(m.facts.assetSymbol, "USDC.e");
});

test("rules: a failed rule blocks without calling SERV", async () => {
  let called = 0;
  const v = await evaluate(byId("R01").mandate, byId("R01").attempt, { serv: cfg, judgeFn: async () => (called++, allPass()) });
  assert.equal(v.decision, "block");
  assert.equal(called, 0);
  assert.equal(v.serv.called, false);
});

test("decision rule: any fail blocks, any warn holds, only clean passes sign", () => {
  const mk = (...s: ("pass" | "warn" | "fail")[]): Check[] => s.map((status) => ({ id: "purpose", by: "serv", status, evidence: "" }));
  assert.equal(decide(mk("pass", "pass")), "sign");
  assert.equal(decide(mk("pass", "warn")), "hold");
  assert.equal(decide(mk("warn", "fail")), "block");
});

test("the model cannot sign past a warning, and its stricter call is kept", async () => {
  const c = byId("L01");
  const lax = await evaluate(c.mandate, c.attempt, { serv: cfg, judgeFn: async () => allPass("sign", { terms: "warn" }) });
  assert.equal(lax.decision, "hold");
  const strict = await evaluate(c.mandate, c.attempt, { serv: cfg, judgeFn: async () => allPass("block") });
  assert.equal(strict.decision, "block");
  const clean = await evaluate(c.mandate, c.attempt, { serv: cfg, judgeFn: async () => allPass("sign") });
  assert.equal(clean.decision, "sign");
  assert.equal(clean.checks.length, 11);
});

test("fails closed: a SERV outage holds, a guard refusal blocks", async () => {
  const c = byId("L01");
  const down = await evaluate(c.mandate, c.attempt, { serv: cfg, judgeFn: async () => ({ checks: null, decision: null, summary: null, meta: { called: true, error: "503" } }) });
  assert.equal(down.decision, "hold");
  const guard = await evaluate(c.mandate, c.attempt, { serv: cfg, judgeFn: async () => ({ checks: null, decision: null, summary: null, meta: { called: true, guardTripped: true } }) });
  assert.equal(guard.decision, "block");
  assert.ok(guard.checks.some((k) => k.id === "instruction_origin" && k.status === "fail"));
});

test("receipts verify, bind to one payment, and break when altered", async () => {
  const c = byId("L01");
  const r = await countersign(c.mandate, c.attempt, { serv: cfg, judgeFn: async () => allPass("sign") });
  assert.equal(await verifyReceipt(r), true);
  assert.equal(receiptCovers(r, c.attempt.challenge), true);
  assert.equal(receiptCovers(r, { ...c.attempt.challenge, amount: "1" + c.attempt.challenge.amount }), false);
  assert.equal(receiptCovers(r, { ...c.attempt.challenge, payTo: "0x617F2E2fD72FD9D5503197092aC168c91465E7f2" }), false);
  assert.equal(receiptCovers(r, c.attempt.challenge, (r.expiresAt + 1) * 1000), false);
  assert.equal(await verifyReceipt({ ...r, decision: "block" }), false);
  assert.equal(await verifyReceipt({ ...r, binding: { ...r.binding, amount: "1" } }), false);
  const blocked = await countersign(byId("R03").mandate, byId("R03").attempt, { serv: cfg });
  assert.equal(await verifyReceipt(blocked), true);
  assert.equal(receiptCovers(blocked, byId("R03").attempt.challenge), false);
});

test("verdict parsing rejects anything that is not a complete verdict", () => {
  const ok = { purpose: { status: "pass", evidence: "a" }, merchant: { status: "pass", evidence: "a" }, instruction_origin: { status: "warn", evidence: "a" }, terms: { status: "pass", evidence: "a" }, value: { status: "pass", evidence: "a" }, decision: "hold", summary: "s" };
  assert.equal(parseVerdict(JSON.stringify(ok))?.decision, "hold");
  assert.equal(parseVerdict("```json\n" + JSON.stringify(ok) + "\n```")?.checks.length, 5);
  assert.equal(parseVerdict("I cannot help with that."), null);
  assert.equal(parseVerdict(JSON.stringify({ ...ok, value: undefined })), null);
  assert.equal(parseVerdict(JSON.stringify({ ...ok, decision: "approve" })), null);
  assert.equal(parseVerdict(JSON.stringify({ ...ok, terms: { status: "maybe", evidence: "a" } })), null);
  assert.equal(parseVerdict(""), null);
});

test("SERV request shape: model suffix and tool markers", () => {
  assert.equal(servModelId(cfg), "gpt-5.4-mini-serv-kronos-multipath");
  assert.equal(servModelId({ ...cfg, kronos: false }), "gpt-5.4-mini-serv-multipath");
  assert.equal(servModelId({ ...cfg, kronos: false, multipath: false }), "gpt-5.4-mini");
  const names = servTools(cfg).map((t) => (t as { function: { name: string } }).function.name);
  assert.deepEqual(names, ["serv_prompt_guard", "serv_shadow_agent"]);
  assert.equal(servTools({ ...cfg, guard: false, shadow: false }).length, 0);
});

test("the system prompt holds no per-request data and the user message holds it all", () => {
  const c = byId("S05");
  const msg = buildUserMessage(c.mandate, c.attempt, runRules(c.mandate, c.attempt).facts);
  assert.ok(msg.includes(c.mandate.task));
  assert.ok(msg.includes("NOTE TO AI AGENTS"));
  assert.ok(!SYSTEM_PROMPT.includes("Berlin"));
  assert.ok(!SYSTEM_PROMPT.includes("—"));
});

test("input validation rejects malformed requests", () => {
  assert.ok(validateInput(null));
  assert.ok(validateInput({ mandate: { task: "x" } }));
  assert.ok(validateInput({ mandate: { task: "", maxPerPaymentUsd: "1", maxTotalUsd: "1" }, attempt: {} }));
  const c = byId("L01");
  assert.ok(validateInput({ mandate: c.mandate, attempt: { ...c.attempt, challenge: { ...c.attempt.challenge, amount: 5 } } }));
  assert.ok(validateInput({ mandate: { ...c.mandate, task: "x".repeat(2001) }, attempt: c.attempt }));
});
