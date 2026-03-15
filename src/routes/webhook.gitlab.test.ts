import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { makeConfig, makeMRHookPayload, makeNoteHookPayload } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig({ gitlabWebhookSecret: "test-secret" });

vi.mock("../config.js", () => ({ config: mockConfig }));

const mockShouldReviewGitlab = vi.fn();
const mockReviewMergeRequest = vi.fn();

vi.mock("../services/trigger.gitlab.js", () => ({
  shouldReviewGitlab: (...args: unknown[]) => mockShouldReviewGitlab(...args),
}));

vi.mock("../services/review.service.js", () => ({
  reviewMergeRequest: (...args: unknown[]) => mockReviewMergeRequest(...args),
}));

vi.mock("../clients/gitlab.platform.js", () => ({
  GitLabPlatformClient: class {},
}));

const { gitlabWebhookRoute } = await import("./webhook.gitlab.js");

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(gitlabWebhookRoute);
  return app;
}

beforeEach(() => {
  mockShouldReviewGitlab.mockReset();
  mockReviewMergeRequest.mockReset();
  mockReviewMergeRequest.mockResolvedValue(undefined);
});

describe("POST /webhook/gitlab", () => {
  describe("authentication", () => {
    it("returns 401 when X-Gitlab-Token missing", async () => {
      const app = buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: { "x-gitlab-event": "Merge Request Hook" },
        payload: makeMRHookPayload(),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid webhook token");
    });

    it("returns 401 when X-Gitlab-Token wrong", async () => {
      const app = buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: {
          "x-gitlab-token": "wrong-secret",
          "x-gitlab-event": "Merge Request Hook",
        },
        payload: makeMRHookPayload(),
      });
      expect(res.statusCode).toBe(401);
    });

    it("accepts correct token", async () => {
      const app = buildApp();
      mockShouldReviewGitlab.mockReturnValue(null);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: {
          "x-gitlab-token": "test-secret",
          "x-gitlab-event": "Merge Request Hook",
        },
        payload: makeMRHookPayload(),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("validation", () => {
    it("returns 400 when X-Gitlab-Event header missing", async () => {
      const app = buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: { "x-gitlab-token": "test-secret" },
        payload: makeMRHookPayload(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Missing X-Gitlab-Event header");
    });

    it("returns 400 for invalid webhook payload", async () => {
      const app = buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: {
          "x-gitlab-token": "test-secret",
          "x-gitlab-event": "Merge Request Hook",
        },
        payload: { object_kind: "unknown_type", invalid: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Invalid webhook payload");
    });
  });

  describe("routing", () => {
    it("returns skipped when trigger doesn't match", async () => {
      const app = buildApp();
      mockShouldReviewGitlab.mockReturnValue(null);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: {
          "x-gitlab-token": "test-secret",
          "x-gitlab-event": "Merge Request Hook",
        },
        payload: makeMRHookPayload(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("skipped");
    });

    it("returns processing and starts review for matching MR", async () => {
      const app = buildApp();
      const reviewReq = {
        identifier: { platform: "gitlab" as const, projectId: 42, mrIid: 10 },
        sourceBranch: "feat",
        targetBranch: "main",
      };
      mockShouldReviewGitlab.mockReturnValue(reviewReq);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: {
          "x-gitlab-token": "test-secret",
          "x-gitlab-event": "Merge Request Hook",
        },
        payload: makeMRHookPayload(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("processing");
      expect(mockReviewMergeRequest).toHaveBeenCalledOnce();
      expect(mockReviewMergeRequest.mock.calls[0][1]).toEqual(reviewReq);
    });

    it("returns processing for matching note trigger", async () => {
      const app = buildApp();
      const reviewReq = {
        identifier: { platform: "gitlab" as const, projectId: 42, mrIid: 10 },
        sourceBranch: "feat",
        targetBranch: "main",
      };
      mockShouldReviewGitlab.mockReturnValue(reviewReq);
      const res = await app.inject({
        method: "POST",
        url: "/webhook/gitlab",
        headers: {
          "x-gitlab-token": "test-secret",
          "x-gitlab-event": "Note Hook",
        },
        payload: makeNoteHookPayload(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("processing");
    });
  });
});

describe("POST /webhook (legacy alias)", () => {
  it("works identically to /webhook/gitlab", async () => {
    const app = buildApp();
    mockShouldReviewGitlab.mockReturnValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        "x-gitlab-token": "test-secret",
        "x-gitlab-event": "Merge Request Hook",
      },
      payload: makeMRHookPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("skipped");
  });
});
