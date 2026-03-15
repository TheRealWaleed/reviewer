import { z } from "zod";

export const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1),
  gitlabToken: z.string(),
  gitlabUrl: z.string(),
  gitlabWebhookSecret: z.string(),
  anthropicApiKey: z.string().min(1),
  claudeModel: z.string().min(1),
  triggerMode: z.enum(["all", "label", "comment"]),
  triggerLabel: z.string(),
  triggerComment: z.string(),
  logLevel: z.string(),
  usageMonthlyTokenLimit: z.number().min(0),
  usageMonthlyDollarLimit: z.number().min(0),
  usageInputTokenCost: z.number().min(0),
  usageOutputTokenCost: z.number().min(0),
  usageAlertWebhookUrl: z.string(),
  usageDataDir: z.string(),
  healthCheckTimeoutMs: z.number().int().min(0),
  githubToken: z.string(),
  githubWebhookSecret: z.string(),
});

export type Config = z.infer<typeof ConfigSchema>;

export type ServerConfig = Pick<Config, "port" | "host" | "logLevel">;
export type ClaudeConfig = Pick<Config, "anthropicApiKey" | "claudeModel">;
export type GitLabConfig = Pick<Config, "gitlabToken" | "gitlabUrl">;
export type TriggerConfig = Pick<Config, "triggerMode" | "triggerLabel" | "triggerComment">;
export type UsageConfig = Pick<
  Config,
  | "usageMonthlyTokenLimit"
  | "usageMonthlyDollarLimit"
  | "usageInputTokenCost"
  | "usageOutputTokenCost"
  | "usageDataDir"
>;
export type HealthConfig = Pick<
  Config,
  "healthCheckTimeoutMs" | "usageMonthlyTokenLimit" | "usageMonthlyDollarLimit"
>;
export type NotificationConfig = Pick<Config, "usageAlertWebhookUrl" | "logLevel">;
export type GitHubConfig = Pick<Config, "githubToken" | "githubWebhookSecret">;
