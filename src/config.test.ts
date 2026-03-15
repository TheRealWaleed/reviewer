import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

function setRequiredEnv() {
  vi.stubEnv("GITLAB_TOKEN", "glpat-test-token");
  vi.stubEnv("GITLAB_WEBHOOK_SECRET", "webhook-secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
}

describe("config", () => {
  it("parses valid complete env", async () => {
    setRequiredEnv();
    vi.stubEnv("PORT", "8080");
    vi.stubEnv("HOST", "127.0.0.1");
    vi.stubEnv("TRIGGER_MODE", "label");
    const { config } = await import("./config.js");
    expect(config.port).toBe(8080);
    expect(config.host).toBe("127.0.0.1");
    expect(config.triggerMode).toBe("label");
    expect(config.gitlabToken).toBe("glpat-test-token");
  });

  it("applies defaults for optional vars", async () => {
    setRequiredEnv();
    const { config } = await import("./config.js");
    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.claudeModel).toBe("claude-sonnet-4-5-20250929");
    expect(config.triggerMode).toBe("all");
    expect(config.triggerLabel).toBe("ai-review");
    expect(config.triggerComment).toBe("/review");
    expect(config.logLevel).toBe("info");
    expect(config.healthCheckTimeoutMs).toBe(5000);
  });

  it("coerces numeric strings", async () => {
    setRequiredEnv();
    vi.stubEnv("PORT", "9090");
    vi.stubEnv("USAGE_MONTHLY_TOKEN_LIMIT", "1000000");
    vi.stubEnv("HEALTH_CHECK_TIMEOUT_MS", "3000");
    const { config } = await import("./config.js");
    expect(config.port).toBe(9090);
    expect(config.usageMonthlyTokenLimit).toBe(1_000_000);
    expect(config.healthCheckTimeoutMs).toBe(3000);
  });

  it("fails on missing required vars", async () => {
    // Don't set any required vars
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("./config.js")).rejects.toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalled();
    const errorOutput = mockConsoleError.mock.calls[0][0] as string;
    expect(errorOutput).toContain("ANTHROPIC_API_KEY");
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it("fails when no platform is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("./config.js")).rejects.toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalled();
    const errorOutput = mockConsoleError.mock.calls[0][0] as string;
    expect(errorOutput).toContain("At least one platform");
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it("accepts GitHub-only config without GitLab vars", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "gh-secret");
    const { config } = await import("./config.js");
    expect(config.githubToken).toBe("ghp_test");
    expect(config.gitlabToken).toBe("");
  });

  it("strips trailing slashes from GITLAB_URL", async () => {
    setRequiredEnv();
    vi.stubEnv("GITLAB_URL", "https://gitlab.example.com///");
    const { config } = await import("./config.js");
    expect(config.gitlabUrl).toBe("https://gitlab.example.com");
  });
});
