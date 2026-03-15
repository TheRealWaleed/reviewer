import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetry } from "./retry.js";

beforeEach(() => {
  vi.useRealTimers();
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 502 and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 502, message: "Bad Gateway" })
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { retries: 2, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 (rate limit)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 429, message: "Rate limited" })
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { retries: 2, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 and 504", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 503, message: "Unavailable" })
      .mockRejectedValueOnce({ statusCode: 504, message: "Timeout" })
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { retries: 2, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on Octokit-style errors (status property)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 502, message: "Bad Gateway" })
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { retries: 1, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 (non-retryable)", async () => {
    const fn = vi.fn().mockRejectedValue({ statusCode: 400, message: "Bad Request" });
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toEqual({
      statusCode: 400,
      message: "Bad Request",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401", async () => {
    const fn = vi.fn().mockRejectedValue({ statusCode: 401, message: "Unauthorized" });
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toEqual({
      statusCode: 401,
      message: "Unauthorized",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on non-HTTP errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow("Network error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts all retries then throws last error", async () => {
    const fn = vi.fn().mockRejectedValue({ statusCode: 503, message: "Unavailable" });
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toEqual({
      statusCode: 503,
      message: "Unavailable",
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses default retries (2) and delay (500ms)", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await withRetry(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
