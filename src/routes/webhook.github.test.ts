import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { makeConfig } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig({
  githubToken: "ghp_test",
  githubWebhookSecret: "gh-secret",
});

vi.mock("../config.js", () => ({ config: mockConfig }));

const mockShouldReviewGithubPR = vi.fn();
const mockShouldReviewGithubComment = vi.fn();
const mockReviewMergeRequest = vi.fn();

vi.mock("../services/trigger.github.js", () => ({
  shouldReviewGithubPR: (...args: unknown[]) => mockShouldReviewGithubPR(...args),
  shouldReviewGithubComment: (...args: unknown[]) => mockShouldReviewGithubComment(...args),
}));

vi.mock("../services/review.service.js", () => ({
  reviewMergeRequest: (...args: unknown[]) => mockReviewMergeRequest(...args),
}));

vi.mock("../clients/github.client.js", () => ({
  GitHubPlatformClient: class {},
}));

const { githubWebhookRoute } = await import("./webhook.github.js");

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(githubWebhookRoute);
  return app;
}

const prPayload = {
  action: "opened",
  pull_request: {
    number: 5,
    title: "Test PR",
    state: "open",
    head: { sha: "abc", ref: "feat" },
    base: { sha: "def", ref: "main" },
  },
  repository: {
    id: 1,
    name: "repo",
    full_name: "octo/repo",
    owner: { id: 1, login: "octo" },
  },
};

const commentPayload = {
  action: "created",
  issue: { number: 5, pull_request: { url: "https://api.github.com/repos/octo/repo/pulls/5" } },
  comment: { id: 100, body: "/review", user: { id: 1, login: "octo" } },
  repository: {
    id: 1,
    name: "repo",
    full_name: "octo/repo",
    owner: { id: 1, login: "octo" },
  },
};

beforeEach(() => {
  mockShouldReviewGithubPR.mockReset();
  mockShouldReviewGithubComment.mockReset();
  mockReviewMergeRequest.mockReset();
  mockReviewMergeRequest.mockResolvedValue(undefined);
});

describe("POST /webhook/github", () => {
  describe("authentication", () => {
    it("returns 401 when signature missing", async () => {
      const app = buildApp();
      const body = JSON.stringify(prPayload);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "pull_request",
        },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid signature");
    });

    it("returns 401 when signature wrong", async () => {
      const app = buildApp();
      const body = JSON.stringify(prPayload);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "pull_request",
          "x-hub-signature-256": "sha256=wrong",
        },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
    });

    it("accepts correct signature", async () => {
      const app = buildApp();
      const body = JSON.stringify(prPayload);
      mockShouldReviewGithubPR.mockReturnValue(null);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "pull_request",
          "x-hub-signature-256": sign(body, "gh-secret"),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("validation", () => {
    it("returns 400 when X-GitHub-Event header missing", async () => {
      const app = buildApp();
      const body = JSON.stringify(prPayload);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": sign(body, "gh-secret"),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Missing X-GitHub-Event header");
    });
  });

  describe("pull_request events", () => {
    it("returns skipped when trigger doesn't match", async () => {
      const app = buildApp();
      const body = JSON.stringify(prPayload);
      mockShouldReviewGithubPR.mockReturnValue(null);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "pull_request",
          "x-hub-signature-256": sign(body, "gh-secret"),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("skipped");
    });

    it("returns processing and starts review for matching PR", async () => {
      const app = buildApp();
      const body = JSON.stringify(prPayload);
      const reviewReq = {
        identifier: { platform: "github" as const, owner: "octo", repo: "repo", pullNumber: 5 },
        sourceBranch: "feat",
        targetBranch: "main",
      };
      mockShouldReviewGithubPR.mockReturnValue(reviewReq);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "pull_request",
          "x-hub-signature-256": sign(body, "gh-secret"),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("processing");
      expect(mockReviewMergeRequest).toHaveBeenCalledOnce();
    });
  });

  describe("issue_comment events", () => {
    it("returns skipped when trigger doesn't match", async () => {
      const app = buildApp();
      const body = JSON.stringify(commentPayload);
      mockShouldReviewGithubComment.mockReturnValue(null);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "issue_comment",
          "x-hub-signature-256": sign(body, "gh-secret"),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("skipped");
    });

    it("returns processing for matching comment trigger", async () => {
      const app = buildApp();
      const body = JSON.stringify(commentPayload);
      const reviewReq = {
        identifier: { platform: "github" as const, owner: "octo", repo: "repo", pullNumber: 5 },
        sourceBranch: "",
        targetBranch: "main",
      };
      mockShouldReviewGithubComment.mockReturnValue(reviewReq);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "issue_comment",
          "x-hub-signature-256": sign(body, "gh-secret"),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("processing");
    });
  });

  describe("unhandled events", () => {
    it("returns skipped for unknown event types", async () => {
      const app = buildApp();
      const body = JSON.stringify({ action: "created" });
      const res = await app.inject({
        method: "POST",
        url: "/webhook/github",
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-hub-signature-256": sign(body, "gh-secret"),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("skipped");
    });
  });
});
