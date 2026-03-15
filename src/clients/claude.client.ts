import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { ClaudeConfig } from "../types/config.types.js";
import { ReviewResponseSchema } from "../types/review.types.js";
import type { ReviewResponse } from "../types/review.types.js";
import { withRetry } from "../utils/retry.js";

const cfg: ClaudeConfig = config;

export class ClaudeParseError extends Error {
  constructor(public readonly rawText: string) {
    super(`Failed to parse Claude response as JSON: ${rawText.slice(0, 500)}`);
  }
}

export class ClaudeSchemaError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Claude response does not match expected schema: ${issues.join("; ")}`);
  }
}

const client = new Anthropic({ apiKey: cfg.anthropicApiKey });

export type OnUsageCallback = (inputTokens: number, outputTokens: number) => void | Promise<void>;

export async function getReview(
  systemPrompt: string,
  userPrompt: string,
  options?: { onUsage?: OnUsageCallback },
): Promise<ReviewResponse> {
  const response = await client.messages.create({
    model: cfg.claudeModel,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  await options?.onUsage?.(response.usage.input_tokens, response.usage.output_tokens);

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Defensive: strip markdown code fences if Claude wraps the JSON despite the system prompt
  // instruction to return raw JSON. Claude occasionally does this anyway.
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ClaudeParseError(cleaned);
  }

  const result = ReviewResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new ClaudeSchemaError(
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }

  return result.data;
}

export async function checkClaudeConnection(signal?: AbortSignal): Promise<void> {
  await withRetry(() =>
    client.messages.countTokens(
      { model: cfg.claudeModel, messages: [{ role: "user", content: "ping" }] },
      { signal },
    ),
  );
}
