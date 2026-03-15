import { config } from "../config.js";
import type { HealthConfig, GitHubConfig } from "../types/config.types.js";
import { checkGitLabConnection } from "../clients/gitlab.client.js";
import { checkClaudeConnection } from "../clients/claude.client.js";
import { GitHubPlatformClient } from "../clients/github.client.js";
import { getUsage } from "./usage.service.js";

const cfg: HealthConfig & GitHubConfig & { gitlabToken: string } = config;

const CACHE_TTL_MS = 15_000;

type CheckStatus = "healthy" | "unhealthy" | "disabled" | "warning";

interface ServiceCheck {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
}

interface UsageCheck {
  status: CheckStatus;
  tokenUsagePercent?: number;
  dollarUsagePercent?: number;
  error?: string;
}

interface PlatformChecks {
  gitlab?: ServiceCheck;
  github?: ServiceCheck;
}

interface HealthResponse {
  status: "healthy" | "unhealthy";
  checks: {
    platforms: PlatformChecks;
    claude: ServiceCheck;
    usage: UsageCheck;
  };
}

let cached: { response: HealthResponse; timestamp: number } | null = null;

let githubClient: GitHubPlatformClient | null = null;
function getGitHubClient(): GitHubPlatformClient {
  if (!githubClient) githubClient = new GitHubPlatformClient();
  return githubClient;
}

async function checkService(fn: (signal?: AbortSignal) => Promise<void>): Promise<ServiceCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.healthCheckTimeoutMs);
  const start = Date.now();
  try {
    await fn(controller.signal);
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: "unhealthy", latencyMs: Date.now() - start, error: message.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

function checkUsage(): UsageCheck {
  const hasTokenLimit = cfg.usageMonthlyTokenLimit > 0;
  const hasDollarLimit = cfg.usageMonthlyDollarLimit > 0;

  if (!hasTokenLimit && !hasDollarLimit) {
    return { status: "disabled" };
  }

  const usage = getUsage();
  const tokenPercent = hasTokenLimit
    ? Math.round((usage.totalTokens / cfg.usageMonthlyTokenLimit) * 100)
    : undefined;
  const dollarPercent = hasDollarLimit
    ? Math.round((usage.estimatedCostUsd / cfg.usageMonthlyDollarLimit) * 100)
    : undefined;

  const maxPercent = Math.max(tokenPercent ?? 0, dollarPercent ?? 0);

  let status: CheckStatus;
  if (maxPercent >= 95) {
    status = "unhealthy";
  } else if (maxPercent >= 80) {
    status = "warning";
  } else {
    status = "healthy";
  }

  return { status, tokenUsagePercent: tokenPercent, dollarUsagePercent: dollarPercent };
}

export async function getHealthStatus(): Promise<HealthResponse> {
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.response;
  }

  const gitlabConfigured = Boolean(cfg.gitlabToken);
  const githubConfigured = Boolean(cfg.githubToken);

  const checks: Promise<ServiceCheck>[] = [];
  const checkLabels: string[] = [];

  if (gitlabConfigured) {
    checks.push(checkService(checkGitLabConnection));
    checkLabels.push("gitlab");
  }

  checks.push(checkService(checkClaudeConnection));
  checkLabels.push("claude");

  if (githubConfigured) {
    checks.push(checkService((signal) => getGitHubClient().checkConnection(signal)));
    checkLabels.push("github");
  }

  const results = await Promise.allSettled(checks);

  function getResult(label: string): ServiceCheck {
    const idx = checkLabels.indexOf(label);
    if (idx === -1) return { status: "disabled", latencyMs: 0 };
    const r = results[idx];
    return r.status === "fulfilled"
      ? r.value
      : { status: "unhealthy", latencyMs: 0, error: "Check failed unexpectedly" };
  }

  const gitlabResult = getResult("gitlab");
  const claudeResult = getResult("claude");

  const platforms: PlatformChecks = {};
  if (gitlabConfigured) platforms.gitlab = gitlabResult;
  if (githubConfigured) platforms.github = getResult("github");

  const usageResult = checkUsage();

  const platformsHealthy =
    (!platforms.gitlab || platforms.gitlab.status === "healthy") &&
    (!platforms.github || platforms.github.status === "healthy");

  const allHealthy =
    platformsHealthy && claudeResult.status === "healthy" && usageResult.status !== "unhealthy";

  const response: HealthResponse = {
    status: allHealthy ? "healthy" : "unhealthy",
    checks: {
      platforms,
      claude: claudeResult,
      usage: usageResult,
    },
  };

  cached = { response, timestamp: Date.now() };
  return response;
}
