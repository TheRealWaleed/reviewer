import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import { shouldReviewGitlab } from "../services/trigger.gitlab.js";
import { reviewMergeRequest } from "../services/review.service.js";
import { GitLabPlatformClient } from "../clients/gitlab.platform.js";
import { WebhookPayloadSchema } from "../types/gitlab.types.js";

function constantTimeEqual(a: string, b: string): boolean {
  // Hash both values to a fixed length before comparing, preventing length leakage
  const hashA = createHmac("sha256", "webhook-compare").update(a).digest();
  const hashB = createHmac("sha256", "webhook-compare").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

const gitlabClient = new GitLabPlatformClient();

async function handler(request: FastifyRequest, reply: FastifyReply) {
  const token = request.headers["x-gitlab-token"];
  if (typeof token !== "string" || !constantTimeEqual(token, config.gitlabWebhookSecret)) {
    return reply.code(401).send({ error: "Invalid webhook token" });
  }

  const eventType = request.headers["x-gitlab-event"] as string;
  if (!eventType) {
    return reply.code(400).send({ error: "Missing X-Gitlab-Event header" });
  }

  const parseResult = WebhookPayloadSchema.safeParse(request.body);
  if (!parseResult.success) {
    request.log.warn({ errors: parseResult.error.issues }, "Invalid webhook payload");
    return reply.code(400).send({ error: "Invalid webhook payload" });
  }

  const payload = parseResult.data;
  request.log.info({ eventType }, "GitLab webhook received");

  const reviewRequest = shouldReviewGitlab(eventType, payload);
  if (!reviewRequest) {
    request.log.info("Event does not match trigger criteria, skipping");
    return reply.code(200).send({ status: "skipped" });
  }

  request.log.info({ identifier: reviewRequest.identifier }, "Starting review");

  reviewMergeRequest(gitlabClient, reviewRequest, request.log).catch((err) => {
    request.log.error(err, "Unhandled review error");
  });

  return reply.code(200).send({ status: "processing" });
}

export async function gitlabWebhookRoute(app: FastifyInstance) {
  if (!config.gitlabToken || !config.gitlabWebhookSecret) {
    return;
  }

  app.post("/webhook/gitlab", { bodyLimit: 2 * 1024 * 1024 }, handler);
  app.post("/webhook", { bodyLimit: 2 * 1024 * 1024 }, handler);
}
