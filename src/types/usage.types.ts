import { z } from "zod";

export const UsageRecordSchema = z.object({
  month: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  estimatedCostUsd: z.number(),
  requestCount: z.number(),
});

export const UsageSnapshotSchema = z.object({
  currentMonth: UsageRecordSchema,
  lastUpdated: z.string(),
});

export const UsageAlertSchema = z.object({
  type: z.enum(["token_limit", "dollar_limit"]),
  threshold: z.number(),
  currentValue: z.number(),
  limitValue: z.number(),
  month: z.string(),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>;
export type UsageAlert = z.infer<typeof UsageAlertSchema>;
