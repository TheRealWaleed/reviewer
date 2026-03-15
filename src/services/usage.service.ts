import { config } from "../config.js";
import type { UsageConfig } from "../types/config.types.js";
import { sendUsageAlert } from "./notification.service.js";
import { loadUsageSnapshot, scheduleUsagePersist } from "./usage.persistence.js";
import type { UsageRecord, UsageSnapshot, UsageAlert } from "../types/usage.types.js";

const cfg: UsageConfig = config;

let currentRecord: UsageRecord = createEmptyRecord();
const firedThresholds = new Set<string>();

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function createEmptyRecord(): UsageRecord {
  return {
    month: getCurrentMonth(),
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    requestCount: 0,
  };
}

function buildSnapshot(): UsageSnapshot {
  return {
    currentMonth: currentRecord,
    lastUpdated: new Date().toISOString(),
  };
}

export async function initUsage(): Promise<void> {
  const snapshot = await loadUsageSnapshot();

  if (snapshot && snapshot.currentMonth.month === getCurrentMonth()) {
    currentRecord = snapshot.currentMonth;
  } else {
    currentRecord = createEmptyRecord();
  }
}

/**
 * Compute estimated cost in USD.
 * Pricing is per-1K tokens (not per-1M). For example:
 *   - usageInputTokenCost = 0.003 means $0.003 per 1,000 input tokens ($3.00 per 1M)
 *   - usageOutputTokenCost = 0.015 means $0.015 per 1,000 output tokens ($15.00 per 1M)
 */
function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1000) * cfg.usageInputTokenCost +
    (outputTokens / 1000) * cfg.usageOutputTokenCost
  );
}

async function checkThresholds(): Promise<void> {
  const thresholds = [80, 95];

  for (const pct of thresholds) {
    if (cfg.usageMonthlyTokenLimit > 0) {
      const key = `token_${pct}_${currentRecord.month}`;
      const limitAtPct = cfg.usageMonthlyTokenLimit * (pct / 100);
      if (currentRecord.totalTokens >= limitAtPct && !firedThresholds.has(key)) {
        firedThresholds.add(key);
        const alert: UsageAlert = {
          type: "token_limit",
          threshold: pct,
          currentValue: currentRecord.totalTokens,
          limitValue: cfg.usageMonthlyTokenLimit,
          month: currentRecord.month,
        };
        await sendUsageAlert(alert);
      }
    }

    if (cfg.usageMonthlyDollarLimit > 0) {
      const key = `dollar_${pct}_${currentRecord.month}`;
      const limitAtPct = cfg.usageMonthlyDollarLimit * (pct / 100);
      if (currentRecord.estimatedCostUsd >= limitAtPct && !firedThresholds.has(key)) {
        firedThresholds.add(key);
        const alert: UsageAlert = {
          type: "dollar_limit",
          threshold: pct,
          currentValue: currentRecord.estimatedCostUsd,
          limitValue: cfg.usageMonthlyDollarLimit,
          month: currentRecord.month,
        };
        await sendUsageAlert(alert);
      }
    }
  }
}

export function recordUsage(inputTokens: number, outputTokens: number): void {
  if (currentRecord.month !== getCurrentMonth()) {
    currentRecord = createEmptyRecord();
    firedThresholds.clear();
  }

  currentRecord.inputTokens += inputTokens;
  currentRecord.outputTokens += outputTokens;
  currentRecord.totalTokens += inputTokens + outputTokens;
  currentRecord.estimatedCostUsd += computeCost(inputTokens, outputTokens);
  currentRecord.requestCount += 1;

  scheduleUsagePersist(buildSnapshot());
  // Fire-and-forget: avoid awaiting to prevent race conditions from concurrent calls
  void checkThresholds().catch(() => {});
}

export function getUsage(): UsageRecord {
  if (currentRecord.month !== getCurrentMonth()) {
    currentRecord = createEmptyRecord();
    firedThresholds.clear();
  }
  return { ...currentRecord };
}
