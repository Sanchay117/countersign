/**
 * The SERV Reasoning call behind every verdict.
 *
 * One request to SERV's OpenAI-compatible endpoint, using:
 *  - a structured-output schema, so the verdict is machine-checked JSON
 *  - serv_prompt_guard, because the request carries text written by sellers
 *  - serv_shadow_agent, to validate the draft verdict and revise it if it fails
 *  - the Kronos and Multipath model features, because the policy is a
 *    branching decision tree whose consequences must stay consistent
 *  - low reasoning effort on a small model, per SERV's Day One guidance
 */
import OpenAI from "openai";
import { POLICY_VERSION, REASONED_CHECKS, SHADOW_HINT, SYSTEM_PROMPT, VERDICT_SCHEMA } from "./policy";
import type { Check, CheckStatus, Decision, ServMeta } from "./types";

export const SERV_BASE_URL = "https://inference-api.openserv.ai/v1";

/** USD per million tokens, from docs.openserv.ai/serv-reasoning/models (prices include SERV Reasoning). */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.13, output: 0.65 },
  "gpt-5.6-luna": { input: 0.25, output: 1.5 },
  "gpt-5.4-nano": { input: 0.25, output: 1.6 },
  "gpt-5.4-mini": { input: 1.0, output: 6.0 },
  "gemini-3.1-flash-lite": { input: 0.3, output: 1.8 },
  "gemini-2.5-flash": { input: 0.4, output: 3.5 },
  "claude-haiku-4.5": { input: 1.25, output: 6.5 },
  "gpt-6.1-sol": { input: 2.4, output: 12.0 },
  "claude-sonnet-5.5": { input: 2.4, output: 12.0 },
};

export interface ServConfig {
  apiKey: string;
  model: string;
  effort: "none" | "low" | "medium" | "high";
  kronos: boolean;
  multipath: boolean;
  guard: boolean;
  shadow: boolean;
  shadowIterations: number;
  /** Output ceiling per request. A verdict is about 400 tokens, so this is ten times what it needs. */
  maxOutputTokens: number;
  timeoutMs: number;
}

const flag = (v: string | undefined, fallback: boolean) => (v === undefined || v === "" ? fallback : !["0", "false", "off", "no"].includes(v.toLowerCase()));

export function servConfigFromEnv(env: Record<string, string | undefined> = process.env): ServConfig {
  return {
    apiKey: (env.SERV_API_KEY ?? "").trim(),
    // The smallest model in SERV's catalog. Start small and move up only if the trap suite says so.
    model: (env.SERV_MODEL ?? "").trim() || "gpt-6-luna",
    effort: ((env.SERV_EFFORT ?? "low").trim() as ServConfig["effort"]) || "low",
    kronos: flag(env.SERV_KRONOS, true),
    multipath: flag(env.SERV_MULTIPATH, true),
    guard: flag(env.SERV_GUARD, true),
    // Off by default. Measured on this policy, the shadow agent multiplied the cost of a check
    // about fifty times and changed no verdict, so it is opt-in for high-value payments.
    shadow: flag(env.SERV_SHADOW, false),
    shadowIterations: Number(env.SERV_SHADOW_ITERATIONS ?? 3) || 3,
    // SERV holds each request's cost ceiling against the balance until it settles. With no cap the
    // ceiling is the model's full output window, and a dozen requests in a minute lock a small
    // balance. A generous cap keeps the hold tiny without squeezing the verdict.
    maxOutputTokens: Number(env.SERV_MAX_OUTPUT_TOKENS ?? 4000) || 4000,
    // A cold request can take a minute: SERV builds, audits and caches the reasoning prompt on first use.
    timeoutMs: Number(env.SERV_TIMEOUT_MS ?? 110000) || 110000,
  };
}

/** "gpt-5.4-mini" + features -> "gpt-5.4-mini-serv-kronos-multipath". */
export function servModelId(cfg: Pick<ServConfig, "model" | "kronos" | "multipath">): string {
  const parts = [cfg.kronos ? "kronos" : "", cfg.multipath ? "multipath" : ""].filter(Boolean);
  return parts.length ? `${cfg.model}-serv-${parts.join("-")}` : cfg.model;
}

export function servFeatures(cfg: ServConfig): string[] {
  return [
    "structured output",
    cfg.guard ? "prompt guard" : "",
    cfg.shadow ? `shadow agent x${cfg.shadowIterations}` : "",
    cfg.kronos ? "kronos" : "",
    cfg.multipath ? "multipath" : "",
    `effort ${cfg.effort}`,
  ].filter(Boolean);
}

export function servTools(cfg: ServConfig): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
  if (cfg.guard) tools.push({ type: "function", function: { name: "serv_prompt_guard" } });
  if (cfg.shadow)
    tools.push({
      type: "function",
      function: {
        name: "serv_shadow_agent",
        description: "Enable SERV shadow-agent validation.",
        parameters: {
          type: "object",
          properties: {
            hint: { type: "string", default: SHADOW_HINT },
            max_iterations: { type: "integer", default: cfg.shadowIterations },
          },
        },
      },
    });
  return tools;
}

export interface Judgment {
  /** Null when SERV refused or failed; the caller must then fail closed. */
  checks: Check[] | null;
  decision: Decision | null;
  summary: string | null;
  meta: ServMeta;
}

const STATUSES: CheckStatus[] = ["pass", "warn", "fail"];

/** Validates the model's JSON at the application boundary. Returns null if it is not a complete verdict. */
export function parseVerdict(text: string | null | undefined): { checks: Check[]; decision: Decision; summary: string } | null {
  if (!text) return null;
  let raw: unknown;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const checks: Check[] = [];
  for (const id of REASONED_CHECKS) {
    const c = o[id] as { status?: unknown; evidence?: unknown } | undefined;
    if (!c || typeof c !== "object") return null;
    if (typeof c.status !== "string" || !STATUSES.includes(c.status as CheckStatus)) return null;
    if (typeof c.evidence !== "string" || !c.evidence.trim()) return null;
    checks.push({ id, by: "serv", status: c.status as CheckStatus, evidence: c.evidence.trim() });
  }
  if (typeof o.decision !== "string" || !["sign", "hold", "block"].includes(o.decision)) return null;
  if (typeof o.summary !== "string" || !o.summary.trim()) return null;
  return { checks, decision: o.decision as Decision, summary: o.summary.trim() };
}

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number | undefined {
  const p = MODEL_PRICES[model];
  if (!p) return undefined;
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Asks SERV Reasoning to judge one payment. Never throws: failures come back in meta.error. */
export async function judge(userMessage: string, cfg: ServConfig = servConfigFromEnv()): Promise<Judgment> {
  const model = servModelId(cfg);
  const meta: ServMeta = { called: true, model, features: servFeatures(cfg) };
  if (!cfg.apiKey) return { checks: null, decision: null, summary: null, meta: { ...meta, called: false, error: "SERV_API_KEY is not set" } };

  const client = new OpenAI({ baseURL: SERV_BASE_URL, apiKey: cfg.apiKey, timeout: cfg.timeoutMs, maxRetries: 0 });
  const tools = servTools(cfg);
  const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_schema", json_schema: VERDICT_SCHEMA as unknown as OpenAI.ResponseFormatJSONSchema["json_schema"] },
    ...(cfg.effort !== "none" ? { reasoning_effort: cfg.effort } : {}),
    ...(tools.length ? { tools } : {}),
    max_completion_tokens: cfg.maxOutputTokens,
    metadata: { policy: POLICY_VERSION },
  };

  const started = Date.now();
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, response } = await client.chat.completions.create(body).withResponse();
      meta.latencyMs = Date.now() - started;
      meta.requestId = response.headers.get("x-request-id") ?? data.id ?? null;
      meta.promptTokens = data.usage?.prompt_tokens;
      meta.completionTokens = data.usage?.completion_tokens;
      if (meta.promptTokens !== undefined && meta.completionTokens !== undefined) meta.estCostUsd = estimateCost(cfg.model, meta.promptTokens, meta.completionTokens);
      const choice = data.choices?.[0];
      meta.finishReason = choice?.finish_reason ?? null;
      const refusal = (choice?.message as { refusal?: string | null } | undefined)?.refusal;
      const parsed = parseVerdict(choice?.message?.content);
      if (parsed) return { ...parsed, meta };
      // No verdict came back. With the guard armed, a refusal means SERV stopped the request before the model ran.
      meta.guardTripped = cfg.guard && (!!refusal || choice?.finish_reason === "content_filter" || !!choice?.message?.content);
      meta.error = refusal || choice?.message?.content?.slice(0, 300) || "SERV returned no verdict";
      return { checks: null, decision: null, summary: null, meta };
    } catch (err) {
      const e = err as { status?: number; message?: string };
      lastError = `${e.status ?? ""} ${e.message ?? String(err)}`.trim();
      const retryable = e.status === undefined || e.status === 429 || e.status >= 500;
      if (!retryable || attempt === 2) break;
      await sleep(600 * (attempt + 1));
    }
  }
  meta.latencyMs = Date.now() - started;
  meta.error = lastError || "SERV request failed";
  return { checks: null, decision: null, summary: null, meta };
}
