import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UsageAlert } from "../types/usage.types.js";

const mockConfig = {
  usageAlertWebhookUrl: "",
  logLevel: "silent",
};

vi.mock("../config.js", () => ({ config: mockConfig }));
vi.mock("../logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Get reference to the mock logger to clear between tests
const { logger: mockLogger } = await import("../logger.js");

beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
  vi.mocked(mockLogger.warn).mockClear();
  vi.mocked(mockLogger.error).mockClear();
  mockConfig.usageAlertWebhookUrl = "";
});

describe("sendUsageAlert", () => {
  it("logs warning via logger channel", async () => {
    const { sendUsageAlert } = await import("./notification.service.js");
    const { logger } = await import("../logger.js");
    const alert: UsageAlert = {
      type: "token_limit",
      threshold: 80,
      currentValue: 800_000,
      limitValue: 1_000_000,
      month: "2025-01",
    };
    await sendUsageAlert(alert);
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it("formats token limit alert message correctly", async () => {
    const { sendUsageAlert } = await import("./notification.service.js");
    const { logger } = await import("../logger.js");
    const alert: UsageAlert = {
      type: "token_limit",
      threshold: 80,
      currentValue: 800_000,
      limitValue: 1_000_000,
      month: "2025-01",
    };
    await sendUsageAlert(alert);
    const logCall = vi.mocked(logger.warn).mock.calls[0];
    const message = logCall[1] as string;
    expect(message).toContain("80%");
    expect(message).toContain("token budget");
  });

  it("formats dollar limit alert message correctly", async () => {
    const { sendUsageAlert } = await import("./notification.service.js");
    const { logger } = await import("../logger.js");
    const alert: UsageAlert = {
      type: "dollar_limit",
      threshold: 95,
      currentValue: 9.5,
      limitValue: 10.0,
      month: "2025-01",
    };
    await sendUsageAlert(alert);
    const logCall = vi.mocked(logger.warn).mock.calls[0];
    const message = logCall[1] as string;
    expect(message).toContain("95%");
    expect(message).toContain("dollar budget");
  });
});

describe("sendUsageAlert with webhook", () => {
  it("posts to webhook URL when configured", async () => {
    mockConfig.usageAlertWebhookUrl = "https://hooks.example.com/alert";
    const { sendUsageAlert } = await import("./notification.service.js");
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const alert: UsageAlert = {
      type: "token_limit",
      threshold: 80,
      currentValue: 800_000,
      limitValue: 1_000_000,
      month: "2025-01",
    };
    await sendUsageAlert(alert);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/alert");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.alert).toEqual(alert);
  });

  it("handles webhook POST failure gracefully", async () => {
    mockConfig.usageAlertWebhookUrl = "https://hooks.example.com/alert";
    const { sendUsageAlert } = await import("./notification.service.js");
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "Internal Server Error" }),
    );
    const alert: UsageAlert = {
      type: "token_limit",
      threshold: 80,
      currentValue: 800_000,
      limitValue: 1_000_000,
      month: "2025-01",
    };
    // Should not throw
    await expect(sendUsageAlert(alert)).resolves.toBeUndefined();
  });
});

describe("registerNotificationChannel", () => {
  it("custom channel receives alerts", async () => {
    const { sendUsageAlert, registerNotificationChannel } =
      await import("./notification.service.js");
    const customChannel = vi.fn().mockResolvedValue(undefined);
    registerNotificationChannel(customChannel);
    const alert: UsageAlert = {
      type: "token_limit",
      threshold: 80,
      currentValue: 800_000,
      limitValue: 1_000_000,
      month: "2025-01",
    };
    await sendUsageAlert(alert);
    expect(customChannel).toHaveBeenCalledOnce();
    expect(customChannel.mock.calls[0][0]).toEqual(alert);
  });
});
