/**
 * Runs the trap suite against SERV Reasoning and writes the results to
 * src/data/bench.json, which the website and the README read.
 *
 *   npm run bench                         all cases, model from the environment
 *   npm run bench -- --model gpt-6-luna   a different base model
 *   npm run bench -- --only S01,S05       a few cases
 *   npm run bench -- --tag luna           write src/data/bench.luna.json instead
 *   npm run bench -- --no-shadow --no-guard --no-kronos --no-multipath
 *
 * Cases that fail an exact rule never reach SERV, so they cost nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CASES, type TrapCase } from "../src/lib/cases";
import { evaluate } from "../src/lib/countersign";
import { POLICY_VERSION } from "../src/lib/policy";
import { runRules } from "../src/lib/rules";
import { servConfigFromEnv, servFeatures, servModelId } from "../src/lib/serv";
import type { Decision, RuleCheckId, Verdict } from "../src/lib/types";
import { LIMIT_RULES } from "../src/lib/x402";

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);

const cfg = servConfigFromEnv();
if (arg("model")) cfg.model = arg("model")!;
if (arg("effort")) cfg.effort = arg("effort") as typeof cfg.effort;
if (has("no-shadow")) cfg.shadow = false;
if (has("no-guard")) cfg.guard = false;
if (has("no-kronos")) cfg.kronos = false;
if (has("no-multipath")) cfg.multipath = false;
if (!cfg.apiKey) throw new Error("SERV_API_KEY is not set. Put it in .env.local and run: npm run bench");

const only = arg("only")?.split(",");
const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
const concurrency = Number(arg("concurrency") ?? 3);
const tag = arg("tag");

/** What each layer would have decided on its own, for the layer-by-layer comparison. */
function layers(c: TrapCase, full: Decision) {
  const r = runRules(c.mandate, c.attempt);
  const limits: Decision = r.checks.some((k) => LIMIT_RULES.includes(k.id as RuleCheckId) && k.status === "fail") ? "block" : "sign";
  const rules: Decision = r.failed ? "block" : "sign";
  return { limits, rules, countersign: full };
}

export interface BenchRow {
  id: string;
  title: string;
  tier: TrapCase["tier"];
  why: string;
  expect: Decision;
  got: Decision;
  /** Exactly the expected decision. */
  exact: boolean;
  /** Safe outcome: a clean payment was signed, anything else was not signed. */
  safe: boolean;
  layers: { limits: Decision; rules: Decision; countersign: Decision };
  summary: string;
  failedChecks: { id: string; by: string; status: string; evidence: string }[];
  servCalled: boolean;
  guardTripped: boolean;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  estCostUsd: number | null;
  requestId: string | null;
  error: string | null;
}

async function runCase(c: TrapCase): Promise<BenchRow> {
  let v: Verdict;
  try {
    v = await evaluate(c.mandate, c.attempt, { serv: cfg });
  } catch (err) {
    v = { decision: "hold", summary: `error: ${(err as Error).message}`, checks: [], facts: runRules(c.mandate, c.attempt).facts, serv: { called: true, error: (err as Error).message } };
  }
  const safe = c.expect === "sign" ? v.decision === "sign" : v.decision !== "sign";
  return {
    id: c.id,
    title: c.title,
    tier: c.tier,
    why: c.why,
    expect: c.expect,
    got: v.decision,
    exact: v.decision === c.expect,
    safe,
    layers: layers(c, v.decision),
    summary: v.summary,
    failedChecks: v.checks.filter((k) => k.status !== "pass").map((k) => ({ id: k.id, by: k.by, status: k.status, evidence: k.evidence })),
    servCalled: v.serv.called,
    guardTripped: !!v.serv.guardTripped,
    latencyMs: v.serv.latencyMs ?? null,
    promptTokens: v.serv.promptTokens ?? null,
    completionTokens: v.serv.completionTokens ?? null,
    estCostUsd: v.serv.estCostUsd ?? null,
    requestId: v.serv.requestId ?? null,
    error: v.serv.error ?? null,
  };
}

const rows: BenchRow[] = new Array(cases.length);
let next = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
    while (next < cases.length) {
      const i = next++;
      rows[i] = await runCase(cases[i]);
      const r = rows[i];
      console.log(`${r.exact ? "ok  " : r.safe ? "near" : "MISS"} ${r.id} expect ${r.expect.padEnd(5)} got ${r.got.padEnd(5)} ${r.servCalled ? `${r.latencyMs ?? "?"}ms` : "rule"}${r.guardTripped ? " guard" : ""}${r.error ? ` ERR ${r.error.slice(0, 120)}` : ""}`);
      if (!r.exact) console.log(`       ${r.summary}`);
    }
  }),
);

const traps = rows.filter((r) => r.expect !== "sign");
const clean = rows.filter((r) => r.expect === "sign");
const served = rows.filter((r) => r.servCalled && r.latencyMs !== null);
const sorted = served.map((r) => r.latencyMs!).sort((a, b) => a - b);
const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
const cost = served.reduce((s, r) => s + (r.estCostUsd ?? 0), 0);
const count = (list: BenchRow[], f: (r: BenchRow) => boolean) => list.filter(f).length;

const totals = {
  cases: rows.length,
  exact: count(rows, (r) => r.exact),
  safe: count(rows, (r) => r.safe),
  traps: traps.length,
  trapsStopped: count(traps, (r) => r.got !== "sign"),
  trapsStoppedByLimits: count(traps, (r) => r.layers.limits !== "sign"),
  trapsStoppedByRules: count(traps, (r) => r.layers.rules !== "sign"),
  clean: clean.length,
  cleanSigned: count(clean, (r) => r.got === "sign"),
  servCalls: served.length,
  errors: count(rows, (r) => !!r.error && !r.guardTripped),
  guardTrips: count(rows, (r) => r.guardTripped),
  latencyP50Ms: pct(0.5),
  latencyP90Ms: pct(0.9),
  estCostUsd: Number(cost.toFixed(6)),
  estCostPerServCheckUsd: served.length ? Number((cost / served.length).toFixed(6)) : null,
  estCostPerCheckUsd: rows.length ? Number((cost / rows.length).toFixed(6)) : null,
  wallSeconds: Math.round((Date.now() - started) / 1000),
};

const out = { ranAt: new Date().toISOString(), policy: POLICY_VERSION, model: servModelId(cfg), baseModel: cfg.model, features: servFeatures(cfg), partial: !!only, totals, rows };
mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
const file = new URL(`../src/data/bench${tag ? `.${tag}` : ""}.json`, import.meta.url);
if (!only || tag) writeFileSync(file, JSON.stringify(out, null, 1) + "\n");

console.log(`\n${servModelId(cfg)}  [${servFeatures(cfg).join(", ")}]`);
console.log(`exact ${totals.exact}/${totals.cases}   safe ${totals.safe}/${totals.cases}`);
console.log(`traps stopped ${totals.trapsStopped}/${totals.traps}  (limits alone ${totals.trapsStoppedByLimits}, limits+rules ${totals.trapsStoppedByRules})`);
console.log(`clean signed  ${totals.cleanSigned}/${totals.clean}`);
console.log(`SERV calls ${totals.servCalls}, errors ${totals.errors}, guard trips ${totals.guardTrips}, p50 ${totals.latencyP50Ms}ms, p90 ${totals.latencyP90Ms}ms`);
console.log(`est. token cost $${totals.estCostUsd} total, $${totals.estCostPerServCheckUsd} per SERV check`);
console.log(!only || tag ? `wrote ${file.pathname}` : "partial run, nothing written");
