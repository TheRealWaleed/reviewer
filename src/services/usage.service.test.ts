import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeConfig, makeUsageSnapshot } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig({
  usageInputTokenCost: 0.003,
  usageOutputTokenCost: 0.015,
  usageMonthlyTokenLimit: 0,
  usageMonthlyDollarLimit: 0,
});

vi.mock("../config.js", () => ({ config: mockConfig }));

const mockLoadUsageSnapshot = vi.fn();
const mockScheduleUsagePersist = vi.fn();

vi.mock("./usage.persistence.js", () => ({
  loadUsageSnapshot: (...args: unknown[]) => mockLoadUsageSnapshot(...args),
  scheduleUsagePersist: (...args: unknown[]) => mockScheduleUsagePersist(...args),
}));

const mockSendUsageAlert = vi.fn();

vi.mock("./notification.service.js", () => ({
  sendUsageAlert: (...args: unknown[]) => mockSendUsageAlert(...args),
}));

beforeEach(() => {
  vi.resetModules();
  mockLoadUsageSnapshot.mockReset();
  mockScheduleUsagePersist.mockReset();
  mockSendUsageAlert.mockReset();
  mockSendUsageAlert.mockResolvedValue(undefined);
  Object.assign(
    mockConfig,
    makeConfig({
      usageInputTokenCost: 0.003,
      usageOutputTokenCost: 0.015,
      usageMonthlyTokenLimit: 0,
      usageMonthlyDollarLimit: 0,
    }),
  );
});

async function freshImport() {
  vi.resetModules();
  return import("./usage.service.js");
}

describe("initUsage", () => {
  it("loads snapshot and restores current month record", async () => {
    const snapshot = makeUsageSnapshot();
    mockLoadUsageSnapshot.mockResolvedValueOnce(snapshot);
    const { initUsage, getUsage } = await freshImport();
    await initUsage();
    const usage = getUsage();
    expect(usage.inputTokens).toBe(snapshot.currentMonth.inputTokens);
  });

  it("creates fresh record when snapshot is from different month", async () => {
    const snapshot = makeUsageSnapshot({
      currentMonth: { ...makeUsageSnapshot().currentMonth, month: "2020-01" },
    });
    mockLoadUsageSnapshot.mockResolvedValueOnce(snapshot);
    const { initUsage, getUsage } = await freshImport();
    await initUsage();
    const usage = getUsage();
    expect(usage.inputTokens).toBe(0);
  });

  it("creates fresh record when no snapshot exists", async () => {
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, getUsage } = await freshImport();
    await initUsage();
    const usage = getUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.month).toBe(new Date().toISOString().slice(0, 7));
  });
});

describe("recordUsage", () => {
  it("accumulates input/output/total tokens", async () => {
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage, getUsage } = await freshImport();
    await initUsage();
    recordUsage(100, 50);
    recordUsage(200, 100);
    const usage = getUsage();
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(150);
    expect(usage.totalTokens).toBe(450);
  });

  it("computes cost using config rates", async () => {
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage, getUsage } = await freshImport();
    await initUsage();
    recordUsage(1000, 1000);
    const usage = getUsage();
    // cost = (1000/1000) * 0.003 + (1000/1000) * 0.015 = 0.018
    expect(usage.estimatedCostUsd).toBeCloseTo(0.018);
  });

  it("increments request count", async () => {
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage, getUsage } = await freshImport();
    await initUsage();
    recordUsage(100, 50);
    recordUsage(100, 50);
    expect(getUsage().requestCount).toBe(2);
  });

  it("schedules persistence", async () => {
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage } = await freshImport();
    await initUsage();
    recordUsage(100, 50);
    expect(mockScheduleUsagePersist).toHaveBeenCalledOnce();
  });
});

describe("getUsage", () => {
  it("returns copy of current record", async () => {
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage, getUsage } = await freshImport();
    await initUsage();
    recordUsage(100, 50);
    const a = getUsage();
    const b = getUsage();
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // different object reference
  });
});

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("threshold alerts", () => {
  it("fires alert at 80% token limit", async () => {
    mockConfig.usageMonthlyTokenLimit = 1000;
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage } = await freshImport();
    await initUsage();
    recordUsage(400, 400); // 800 total = 80%
    await flushMicrotasks();
    expect(mockSendUsageAlert).toHaveBeenCalledOnce();
    expect(mockSendUsageAlert.mock.calls[0][0]).toMatchObject({
      type: "token_limit",
      threshold: 80,
    });
  });

  it("fires alert at 95% token limit", async () => {
    mockConfig.usageMonthlyTokenLimit = 1000;
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage } = await freshImport();
    await initUsage();
    recordUsage(500, 500); // 1000 total = 100%
    await flushMicrotasks();
    // Should fire both 80% and 95%
    expect(mockSendUsageAlert).toHaveBeenCalledTimes(2);
  });

  it("fires alert at 80% dollar limit", async () => {
    mockConfig.usageMonthlyDollarLimit = 1.0;
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage } = await freshImport();
    await initUsage();
    // Cost = (50000/1000)*0.003 + (50000/1000)*0.015 = 0.15 + 0.75 = 0.9 => 90% of $1.0
    recordUsage(50000, 50000);
    await flushMicrotasks();
    const dollarAlerts = mockSendUsageAlert.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === "dollar_limit",
    );
    expect(dollarAlerts.length).toBeGreaterThanOrEqual(1);
    expect(dollarAlerts[0][0]).toMatchObject({ type: "dollar_limit", threshold: 80 });
  });

  it("does not re-fire same threshold", async () => {
    mockConfig.usageMonthlyTokenLimit = 1000;
    mockLoadUsageSnapshot.mockResolvedValueOnce(null);
    const { initUsage, recordUsage } = await freshImport();
    await initUsage();
    recordUsage(400, 400); // 800 = 80%
    await flushMicrotasks();
    recordUsage(10, 10); // 820 = still > 80%
    await flushMicrotasks();
    // Only the first crossing fires the 80% alert
    const tokenAlerts = mockSendUsageAlert.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string; threshold: number }).threshold === 80,
    );
    expect(tokenAlerts).toHaveLength(1);
  });
});
