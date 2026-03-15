import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeConfig } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig({
  healthCheckTimeoutMs: 5000,
  usageMonthlyTokenLimit: 0,
  usageMonthlyDollarLimit: 0,
  githubToken: "",
  githubWebhookSecret: "",
});

vi.mock("../config.js", () => ({ config: mockConfig }));

const mockCheckGitLab = vi.fn();
const mockCheckClaude = vi.fn();
const mockGetUsage = vi.fn();
const mockGitHubCheckConnection = vi.fn();

vi.mock("../clients/gitlab.client.js", () => ({
  checkGitLabConnection: (...args: unknown[]) => mockCheckGitLab(...args),
}));

vi.mock("../clients/claude.client.js", () => ({
  checkClaudeConnection: (...args: unknown[]) => mockCheckClaude(...args),
}));

vi.mock("./usage.service.js", () => ({
  getUsage: () => mockGetUsage(),
}));

vi.mock("../clients/github.client.js", () => ({
  GitHubPlatformClient: class {
    checkConnection = (...args: unknown[]) => mockGitHubCheckConnection(...args);
  },
}));

beforeEach(async () => {
  vi.resetModules();
  mockCheckGitLab.mockReset();
  mockCheckClaude.mockReset();
  mockGetUsage.mockReset();
  mockGitHubCheckConnection.mockReset();
  Object.assign(
    mockConfig,
    makeConfig({
      healthCheckTimeoutMs: 5000,
      usageMonthlyTokenLimit: 0,
      usageMonthlyDollarLimit: 0,
      githubToken: "",
      githubWebhookSecret: "",
    }),
  );
  mockGetUsage.mockReturnValue({
    month: "2025-01",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    requestCount: 0,
  });
});

async function freshHealth() {
  vi.resetModules();
  return import("./health.service.js");
}

describe("getHealthStatus", () => {
  it("returns healthy when both services pass and usage OK", async () => {
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("healthy");
    expect(result.checks.platforms.gitlab.status).toBe("healthy");
    expect(result.checks.claude.status).toBe("healthy");
  });

  it("returns unhealthy when GitLab check fails", async () => {
    mockCheckGitLab.mockRejectedValue(new Error("connection refused"));
    mockCheckClaude.mockResolvedValue(undefined);
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.platforms.gitlab.status).toBe("unhealthy");
    expect(result.checks.platforms.gitlab.error).toContain("connection refused");
  });

  it("returns unhealthy when Claude check fails", async () => {
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockRejectedValue(new Error("auth error"));
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.claude.status).toBe("unhealthy");
  });

  it("returns unhealthy when usage >= 95%", async () => {
    mockConfig.usageMonthlyTokenLimit = 1000;
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    mockGetUsage.mockReturnValue({
      month: "2025-01",
      inputTokens: 500,
      outputTokens: 500,
      totalTokens: 1000,
      estimatedCostUsd: 0,
      requestCount: 1,
    });
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.usage.status).toBe("unhealthy");
  });

  it("returns healthy when usage < 80%", async () => {
    mockConfig.usageMonthlyTokenLimit = 1000;
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    mockGetUsage.mockReturnValue({
      month: "2025-01",
      inputTokens: 100,
      outputTokens: 100,
      totalTokens: 200,
      estimatedCostUsd: 0,
      requestCount: 1,
    });
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("healthy");
    expect(result.checks.usage.status).toBe("healthy");
  });

  it("returns disabled usage status when no limits configured", async () => {
    mockConfig.usageMonthlyTokenLimit = 0;
    mockConfig.usageMonthlyDollarLimit = 0;
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.checks.usage.status).toBe("disabled");
  });

  it("returns cached response within 15s TTL", async () => {
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    const { getHealthStatus } = await freshHealth();
    const first = await getHealthStatus();
    mockCheckGitLab.mockRejectedValue(new Error("should not be called"));
    const second = await getHealthStatus();
    expect(second).toEqual(first);
    expect(mockCheckGitLab).toHaveBeenCalledTimes(1);
  });

  it("includes GitHub check when configured", async () => {
    mockConfig.githubToken = "ghp_test";
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    mockGitHubCheckConnection.mockResolvedValue(undefined);
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("healthy");
    expect(result.checks.platforms.github).toBeDefined();
    expect(result.checks.platforms.github!.status).toBe("healthy");
  });

  it("returns unhealthy when GitHub check fails", async () => {
    mockConfig.githubToken = "ghp_test";
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    mockGitHubCheckConnection.mockRejectedValue(new Error("github auth failed"));
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.platforms.github!.status).toBe("unhealthy");
  });

  it("does not include GitHub check when not configured", async () => {
    mockConfig.githubToken = "";
    mockCheckGitLab.mockResolvedValue(undefined);
    mockCheckClaude.mockResolvedValue(undefined);
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.checks.platforms.github).toBeUndefined();
  });

  it("does not include GitLab check when not configured", async () => {
    mockConfig.gitlabToken = "";
    mockConfig.githubToken = "ghp_test";
    mockCheckClaude.mockResolvedValue(undefined);
    mockGitHubCheckConnection.mockResolvedValue(undefined);
    const { getHealthStatus } = await freshHealth();
    const result = await getHealthStatus();
    expect(result.status).toBe("healthy");
    expect(result.checks.platforms.gitlab).toBeUndefined();
    expect(result.checks.platforms.github).toBeDefined();
  });
});
