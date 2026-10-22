/**
 * Asks Claude to put a Start/Sit decision into 2-3 friendly sentences.
 * Only runs when ANTHROPIC_API_KEY is set (server-side only, never sent to the browser).
 * Any problem (no key, timeout, refusal, a number that isn't in our data) means no
 * AI text, and the screen simply shows the rules-based reasons instead.
 */
import Anthropic from "@anthropic-ai/sdk";
import { cacheLife } from "next/cache";
import { explainPayload, isGrounded, readClaudeText, SYSTEM_PROMPT, userPrompt, type ExplainPayload } from "./explain";
import type { StartSitResult } from "./types";

export const AI_MODEL = "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * One shared, cached answer per distinct decision (same players, same numbers).
 * Returns null on failure; failures are only remembered for a minute so a hiccup doesn't stick.
 */
async function explainCached(payloadJson: string): Promise<string | null> {
  "use cache: remote";
  const payload = JSON.parse(payloadJson) as ExplainPayload;
  try {
    // Reads ANTHROPIC_API_KEY itself. One quick retry at most: the rules-based reasons are already on screen.
    const client = new Anthropic({ timeout: 15_000, maxRetries: 1 });
    const message = await client.beta.messages.create({
      model: AI_MODEL,
      // Room for the model's thinking plus three sentences.
      max_tokens: 4000,
      // A short explanation doesn't need deep thinking; low effort keeps it fast and cheap.
      output_config: { effort: "low" },
      // If the model declines, the API retries on a model it picks instead of giving up.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(payload) }],
    });
    const text = readClaudeText(message);
    if (text && isGrounded(text, payload)) {
      cacheLife("outlook");
      return text;
    }
    if (text) console.error("startsit ai: explanation used numbers we didn't give it; ignored");
  } catch (error) {
    // Status and message only: the request body never goes to the logs.
    if (error instanceof Anthropic.APIError) console.error("startsit ai: Claude responded", error.status, error.message);
    else console.error("startsit ai failed", error);
  }
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  return null;
}

/** The AI explanation for a result, or null (no key, nothing to explain, or it failed). */
export async function aiSummary(result: StartSitResult): Promise<string | null> {
  if (!aiConfigured()) return null;
  const payload = explainPayload(result);
  if (!payload) return null;
  return explainCached(JSON.stringify(payload));
}
