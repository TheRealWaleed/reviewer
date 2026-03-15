import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import { shouldReviewGithubPR, shouldReviewGithubComment } from "../services/trigger.github.js";
import { reviewMergeRequest } from "../services/review.service.js";
import { GitHubPlatformClient } from "../clients/github.client.js";
import {
  GitHubPullRequestEventSchema,
  GitHubIssueCommentEventSchema,
} from "../types/github.types.js";

function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

export async function githubWebhookRoute(app: FastifyInstance) {
  if (!config.githubToken || !config.githubWebhookSecret) {
    // GitHub not configured, skip registering the route
    return;
  }

  const githubClient = new GitHubPlatformClient();

  // Register in its own scope with raw body parser for HMAC verification
  app.register(async function githubScope(instance) {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, result?: unknown) => void) => {
        done(null, body);
      },
    );

    instance.post(
      "/webhook/github",
      { bodyLimit: 2 * 1024 * 1024 },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const rawBody = request.body as Buffer;
        const signature = request.headers["x-hub-signature-256"] as string | undefined;

        if (!verifySignature(rawBody, signature, config.githubWebhookSecret)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        const eventType = request.headers["x-github-event"] as string;
        if (!eventType) {
          return reply.code(400).send({ error: "Missing X-GitHub-Event header" });
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody.toString("utf-8"));
        } catch {
          return reply.code(400).send({ error: "Invalid JSON body" });
        }

        request.log.info({ eventType }, "GitHub webhook received");

        if (eventType === "pull_request") {
          const parseResult = GitHubPullRequestEventSchema.safeParse(parsed);
          if (!parseResult.success) {
            request.log.warn({ errors: parseResult.error.issues }, "Invalid PR webhook payload");
            return reply.code(400).send({ error: "Invalid webhook payload" });
          }

          const reviewRequest = shouldReviewGithubPR(parseResult.data);
          if (!reviewRequest) {
            request.log.info("PR event does not match trigger criteria, skipping");
            return reply.code(200).send({ status: "skipped" });
          }

          request.log.info({ identifier: reviewRequest.identifier }, "Starting review");
          reviewMergeRequest(githubClient, reviewRequest, request.log).catch((err) => {
            request.log.error(err, "Unhandled review error");
          });
          return reply.code(200).send({ status: "processing" });
        }

        if (eventType === "issue_comment") {
          const parseResult = GitHubIssueCommentEventSchema.safeParse(parsed);
          if (!parseResult.success) {
            request.log.warn(
              { errors: parseResult.error.issues },
              "Invalid comment webhook payload",
            );
            return reply.code(400).send({ error: "Invalid webhook payload" });
          }

          const reviewRequest = shouldReviewGithubComment(parseResult.data);
          if (!reviewRequest) {
            request.log.info("Comment event does not match trigger criteria, skipping");
            return reply.code(200).send({ status: "skipped" });
          }

          request.log.info(
            { identifier: reviewRequest.identifier },
            "Starting review from comment",
          );
          reviewMergeRequest(githubClient, reviewRequest, request.log).catch((err) => {
            request.log.error(err, "Unhandled review error");
          });
          return reply.code(200).send({ status: "processing" });
        }

        // Unhandled event type — acknowledge but skip
        request.log.info({ eventType }, "Unhandled GitHub event type, skipping");
        return reply.code(200).send({ status: "skipped" });
      },
    );
  });
}
