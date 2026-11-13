/**
 * One SERV call for one case, printing the raw response shape. Used to learn
 * what a check costs and how each SERV feature behaves before a full run.
 *
 *   npx tsx --env-file=.env.local scripts/probe-serv.ts <case-id> [model] [--no-shadow] [--no-guard] [--no-kronos] [--no-multipath] [--raw]
 */
import OpenAI from "openai";
import { CASES } from "../src/lib/cases";
import { buildUserMessage, SYSTEM_PROMPT, VERDICT_SCHEMA } from "../src/lib/policy";
import { runRules } from "../src/lib/rules";
import { estimateCost, parseVerdict, SERV_BASE_URL, servConfigFromEnv, servFeatures, servModelId, servTools } from "../src/lib/serv";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [caseId = "L01", model] = args.filter((a) => !a.startsWith("--"));
const c = CASES.find((k) => k.id === caseId);
if (!c) throw new Error(`unknown case ${caseId}`);

const cfg = servConfigFromEnv();
if (model) cfg.model = model;
if (flags.has("--no-shadow")) cfg.shadow = false;
if (flags.has("--no-guard")) cfg.guard = false;
if (flags.has("--no-kronos")) cfg.kronos = false;
if (flags.has("--no-multipath")) cfg.multipath = false;

const facts = runRules(c.mandate, c.attempt).facts;
const client = new OpenAI({ baseURL: SERV_BASE_URL, apiKey: cfg.apiKey, timeout: 120000, maxRetries: 0 });
const tools = servTools(cfg);
const started = Date.now();
try {
  const { data, response } = await client.chat.completions
    .create({
      model: servModelId(cfg),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(c.mandate, c.attempt, facts) },
      ],
      response_format: { type: "json_schema", json_schema: VERDICT_SCHEMA as never },
      ...(cfg.effort !== "none" ? { reasoning_effort: cfg.effort } : {}),
      ...(tools.length ? { tools } : {}),
      max_completion_tokens: cfg.maxOutputTokens,
    })
    .withResponse();
  const ms = Date.now() - started;
  console.log(`${servModelId(cfg)} [${servFeatures(cfg).join(", ")}] ${ms} ms, HTTP ${response.status}`);
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    if (/serv|request|cost|credit|cache|usage|ratelimit/i.test(k)) headers[k] = v;
  });
  console.log("headers:", JSON.stringify(headers));
  console.log("usage:", JSON.stringify(data.usage));
  const choice = data.choices?.[0];
  console.log("finish_reason:", choice?.finish_reason, "refusal:", (choice?.message as { refusal?: string })?.refusal ?? null);
  const extra = Object.keys(data).filter((k) => !["id", "object", "created", "model", "choices", "usage"].includes(k));
  if (extra.length) console.log("extra top-level keys:", extra.join(", "), JSON.stringify(Object.fromEntries(extra.map((k) => [k, (data as never)[k]]))).slice(0, 600));
  const v = parseVerdict(choice?.message?.content);
  if (v) {
    console.log(`expect ${c.expect}, model says ${v.decision}: ${v.summary}`);
    for (const k of v.checks) console.log(`  [${k.status}] ${k.id}: ${k.evidence}`);
  } else console.log("no verdict parsed. content:", (choice?.message?.content ?? "").slice(0, 600));
  if (flags.has("--raw")) console.log(JSON.stringify(data, null, 1).slice(0, 4000));
  if (data.usage) console.log("est. token cost $", estimateCost(cfg.model, data.usage.prompt_tokens, data.usage.completion_tokens)?.toFixed(6));
} catch (err) {
  const e = err as { status?: number; message?: string; error?: unknown };
  console.log(`FAILED after ${Date.now() - started} ms: ${e.status ?? ""} ${e.message}`);
  if (e.error) console.log(JSON.stringify(e.error).slice(0, 800));
}
