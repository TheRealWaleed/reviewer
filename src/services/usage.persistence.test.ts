import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeConfig, makeUsageSnapshot } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig();
vi.mock("../config.js", () => ({ config: mockConfig }));

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock("../logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

beforeEach(() => {
  vi.useFakeTimers();
  mockReadFile.mockReset();
  mockWriteFile.mockReset();
  mockMkdir.mockReset();
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// Re-import for each describe to get fresh module state
describe("loadUsageSnapshot", () => {
  it("returns parsed snapshot from valid file", async () => {
    const snapshot = makeUsageSnapshot();
    mockReadFile.mockResolvedValueOnce(JSON.stringify(snapshot));
    // Need fresh import to avoid stale timer state
    const { loadUsageSnapshot } = await import("./usage.persistence.js");
    const result = await loadUsageSnapshot();
    expect(result).toEqual(snapshot);
  });

  it("returns null for invalid JSON", async () => {
    mockReadFile.mockResolvedValueOnce("not json{{{");
    const { loadUsageSnapshot } = await import("./usage.persistence.js");
    const result = await loadUsageSnapshot();
    expect(result).toBeNull();
  });

  it("returns null for schema-invalid data", async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ wrong: "shape" }));
    const { loadUsageSnapshot } = await import("./usage.persistence.js");
    const result = await loadUsageSnapshot();
    expect(result).toBeNull();
  });

  it("returns null when file doesn't exist", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    const { loadUsageSnapshot } = await import("./usage.persistence.js");
    const result = await loadUsageSnapshot();
    expect(result).toBeNull();
  });
});

describe("scheduleUsagePersist", () => {
  it("writes file after 10s debounce", async () => {
    vi.resetModules();
    const { scheduleUsagePersist } = await import("./usage.persistence.js");
    const snapshot = makeUsageSnapshot();
    scheduleUsagePersist(snapshot);
    expect(mockWriteFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written).toEqual(snapshot);
  });

  it("uses latest snapshot, not stale one", async () => {
    vi.resetModules();
    const { scheduleUsagePersist } = await import("./usage.persistence.js");
    const first = makeUsageSnapshot({ lastUpdated: "2025-01-01T00:00:00Z" });
    const second = makeUsageSnapshot({ lastUpdated: "2025-01-02T00:00:00Z" });
    scheduleUsagePersist(first);
    scheduleUsagePersist(second);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockWriteFile).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.lastUpdated).toBe("2025-01-02T00:00:00Z");
  });
});

describe("flushPendingPersist", () => {
  it("writes immediately and clears timer", async () => {
    vi.resetModules();
    const { scheduleUsagePersist, flushPendingPersist } = await import("./usage.persistence.js");
    const snapshot = makeUsageSnapshot();
    scheduleUsagePersist(snapshot);
    await flushPendingPersist();
    expect(mockWriteFile).toHaveBeenCalledOnce();
  });

  it("does nothing when no pending snapshot", async () => {
    vi.resetModules();
    const { flushPendingPersist } = await import("./usage.persistence.js");
    await flushPendingPersist();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
