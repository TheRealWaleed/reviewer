import type { FastifyInstance } from "fastify";
import { gitlabWebhookRoute } from "./webhook.gitlab.js";
import { githubWebhookRoute } from "./webhook.github.js";

export async function webhookRoute(app: FastifyInstance) {
  await app.register(gitlabWebhookRoute);
  await app.register(githubWebhookRoute);
}
