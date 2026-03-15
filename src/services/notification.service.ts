import { config } from "../config.js";
import type { NotificationConfig } from "../types/config.types.js";
import type { UsageAlert } from "../types/usage.types.js";
import { logger } from "../logger.js";

const cfg: NotificationConfig = config;

export type NotificationChannel = (alert: UsageAlert, message: string) => Promise<void>;

const channels: NotificationChannel[] = [];

channels.push(async (alert, message) => {
  logger.warn({ alert }, message);
});

// Webhook channel — registered only if URL is configured
if (cfg.usageAlertWebhookUrl) {
  channels.push(async (alert, message) => {
    const payload = { text: message, alert };

    const response = await fetch(cfg.usageAlertWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, url: cfg.usageAlertWebhookUrl },
        "Failed to send usage alert webhook",
      );
    }
  });
}

export function registerNotificationChannel(channel: NotificationChannel): void {
  channels.push(channel);
}

function formatAlertMessage(alert: UsageAlert): string {
  const pct = alert.threshold;
  if (alert.type === "token_limit") {
    const current = (alert.currentValue / 1_000_000).toFixed(2);
    const limit = (alert.limitValue / 1_000_000).toFixed(2);
    return `⚠️ AI Reviewer: ${pct}% of monthly token budget used (${current}M / ${limit}M tokens)`;
  }
  const current = alert.currentValue.toFixed(2);
  const limit = alert.limitValue.toFixed(2);
  return `⚠️ AI Reviewer: ${pct}% of monthly dollar budget used ($${current} / $${limit})`;
}

export async function sendUsageAlert(alert: UsageAlert): Promise<void> {
  const message = formatAlertMessage(alert);

  for (const channel of channels) {
    await channel(alert, message).catch((err) => {
      logger.error({ err }, "Error dispatching usage alert");
    });
  }
}
