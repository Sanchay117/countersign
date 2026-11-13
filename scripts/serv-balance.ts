/**
 * Reads the SERV credit balance without spending it. SERV rejects a request
 * whose cost ceiling is above the balance and states the balance in the error,
 * so this asks for an output budget no balance this small can cover.
 *
 *   npx tsx --env-file=.env.local scripts/serv-balance.ts
 */
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../src/lib/policy";
import { SERV_BASE_URL, servConfigFromEnv } from "../src/lib/serv";

const cfg = servConfigFromEnv();
const client = new OpenAI({ baseURL: SERV_BASE_URL, apiKey: cfg.apiKey, timeout: 60000, maxRetries: 0 });
try {
  const res = await client.chat.completions.create({
    model: "gpt-6-luna",
    // The cached policy prompt, so nothing new is generated if the request is accepted after all.
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Reply with the single word: ok" },
    ],
    max_completion_tokens: 4_000_000,
  });
  console.log("request was accepted, so the balance covers a very large ceiling. usage:", JSON.stringify(res.usage));
} catch (err) {
  const e = err as { status?: number; message?: string };
  const text = e.message ?? "";
  const stated = text.match(/balance of \$([0-9.]+)/);
  // SERV lowers the output budget to what the balance can pay for before forwarding the request,
  // and the model then rejects that number as too large. It is the balance in output tokens.
  const affordable = text.match(/whereas you provided (\d+)/);
  if (stated) console.log(`balance: $${stated[1]}`);
  else if (affordable) console.log(`balance: about $${((Number(affordable[1]) * 0.65) / 1_000_000).toFixed(5)} (${affordable[1]} output tokens of gpt-6-luna)`);
  else console.log(`no balance in the reply: ${e.status} ${text}`);
}
