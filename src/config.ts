import { z } from "zod";
import { ConfigSchema } from "./types/config.types.js";
import type { Config } from "./types/config.types.js";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  GITLAB_TOKEN: z.string().default(""),
  GITLAB_URL: z.string().default("https://gitlab.com"),
  GITLAB_WEBHOOK_SECRET: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-5-20250929"),
  TRIGGER_MODE: z.enum(["all", "label", "comment"]).default("all"),
  TRIGGER_LABEL: z.string().default("ai-review"),
  TRIGGER_COMMENT: z.string().default("/review"),
  LOG_LEVEL: z.string().default("info"),
  USAGE_MONTHLY_TOKEN_LIMIT: z.coerce.number().min(0).default(0),
  USAGE_MONTHLY_DOLLAR_LIMIT: z.coerce.number().min(0).default(0),
  USAGE_INPUT_TOKEN_COST: z.coerce.number().min(0).default(0.003),
  USAGE_OUTPUT_TOKEN_COST: z.coerce.number().min(0).default(0.015),
  USAGE_ALERT_WEBHOOK_URL: z.string().default(""),
  USAGE_DATA_DIR: z.string().default("data"),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(0).default(5000),
  GITHUB_TOKEN: z.string().default(""),
  GITHUB_WEBHOOK_SECRET: z.string().default(""),
});

function loadConfig(): Config {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`Invalid environment variables:\n${formatted}`);
    process.exit(1);
  }

  const env = result.data;

  const hasGitLab = Boolean(env.GITLAB_TOKEN && env.GITLAB_WEBHOOK_SECRET);
  const hasGitHub = Boolean(env.GITHUB_TOKEN && env.GITHUB_WEBHOOK_SECRET);
  if (!hasGitLab && !hasGitHub) {
    console.error(
      "At least one platform must be configured:\n" +
        "  - GitLab: set GITLAB_TOKEN and GITLAB_WEBHOOK_SECRET\n" +
        "  - GitHub: set GITHUB_TOKEN and GITHUB_WEBHOOK_SECRET",
    );
    process.exit(1);
  }

  return ConfigSchema.parse({
    port: env.PORT,
    host: env.HOST,
    gitlabToken: env.GITLAB_TOKEN,
    gitlabUrl: env.GITLAB_URL.replace(/\/+$/, ""),
    gitlabWebhookSecret: env.GITLAB_WEBHOOK_SECRET,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    claudeModel: env.CLAUDE_MODEL,
    triggerMode: env.TRIGGER_MODE,
    triggerLabel: env.TRIGGER_LABEL,
    triggerComment: env.TRIGGER_COMMENT,
    logLevel: env.LOG_LEVEL,
    usageMonthlyTokenLimit: env.USAGE_MONTHLY_TOKEN_LIMIT,
    usageMonthlyDollarLimit: env.USAGE_MONTHLY_DOLLAR_LIMIT,
    usageInputTokenCost: env.USAGE_INPUT_TOKEN_COST,
    usageOutputTokenCost: env.USAGE_OUTPUT_TOKEN_COST,
    usageAlertWebhookUrl: env.USAGE_ALERT_WEBHOOK_URL,
    usageDataDir: env.USAGE_DATA_DIR,
    healthCheckTimeoutMs: env.HEALTH_CHECK_TIMEOUT_MS,
    githubToken: env.GITHUB_TOKEN,
    githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
  });
}

export const config: Config = loadConfig();
