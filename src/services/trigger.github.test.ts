import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeConfig } from "../test-helpers/fixtures.js";
import type { GitHubPullRequestEvent, GitHubIssueCommentEvent } from "../types/github.types.js";

const mockConfig = makeConfig();

vi.mock("../config.js", () => ({ config: mockConfig }));

const { shouldReviewGithubPR, shouldReviewGithubComment } = await import("./trigger.github.js");

function makePREvent(overrides?: Partial<GitHubPullRequestEvent>): GitHubPullRequestEvent {
  return {
    action: "opened",
    pull_request: {
      number: 5,
      title: "Test PR",
      state: "open",
      head: { sha: "abc123", ref: "feature-branch" },
      base: { sha: "def456", ref: "main" },
    },
    repository: {
      id: 1,
      name: "repo",
      full_name: "octo/repo",
      owner: { id: 1, login: "octo" },
    },
    ...overrides,
  };
}

function makeCommentEvent(overrides?: Partial<GitHubIssueCommentEvent>): GitHubIssueCommentEvent {
  return {
    action: "created",
    issue: {
      number: 5,
      pull_request: { url: "https://api.github.com/repos/octo/repo/pulls/5" },
    },
    comment: {
      id: 100,
      body: "/review",
      user: { id: 1, login: "octo" },
    },
    repository: {
      id: 1,
      name: "repo",
      full_name: "octo/repo",
      owner: { id: 1, login: "octo" },
    },
    ...overrides,
  };
}

describe("shouldReviewGithubPR", () => {
  beforeEach(() => {
    Object.assign(mockConfig, makeConfig());
  });

  describe("mode=all", () => {
    it("returns ReviewRequest for opened PR", () => {
      const result = shouldReviewGithubPR(makePREvent({ action: "opened" }));
      expect(result).toEqual({
        identifier: { platform: "github", owner: "octo", repo: "repo", pullNumber: 5 },
        sourceBranch: "feature-branch",
        targetBranch: "main",
      });
    });

    it("returns ReviewRequest for synchronize event", () => {
      const result = shouldReviewGithubPR(makePREvent({ action: "synchronize" }));
      expect(result).not.toBeNull();
    });

    it("returns null for closed PR", () => {
      expect(shouldReviewGithubPR(makePREvent({ action: "closed" }))).toBeNull();
    });

    it("returns null for labeled action in all mode", () => {
      expect(shouldReviewGithubPR(makePREvent({ action: "labeled" }))).toBeNull();
    });
  });

  describe("mode=label", () => {
    beforeEach(() => {
      mockConfig.triggerMode = "label";
      mockConfig.triggerLabel = "ai-review";
    });

    it("returns ReviewRequest when labeled with matching label", () => {
      const result = shouldReviewGithubPR(
        makePREvent({ action: "labeled", label: { name: "ai-review" } }),
      );
      expect(result).not.toBeNull();
      expect(result!.identifier).toEqual({
        platform: "github",
        owner: "octo",
        repo: "repo",
        pullNumber: 5,
      });
    });

    it("returns null when labeled with wrong label", () => {
      expect(
        shouldReviewGithubPR(makePREvent({ action: "labeled", label: { name: "other" } })),
      ).toBeNull();
    });

    it("returns null for opened in label mode", () => {
      expect(shouldReviewGithubPR(makePREvent({ action: "opened" }))).toBeNull();
    });
  });

  describe("mode=comment", () => {
    beforeEach(() => {
      mockConfig.triggerMode = "comment";
    });

    it("returns null for any PR event", () => {
      expect(shouldReviewGithubPR(makePREvent({ action: "opened" }))).toBeNull();
    });
  });
});

describe("shouldReviewGithubComment", () => {
  beforeEach(() => {
    Object.assign(mockConfig, makeConfig({ triggerMode: "comment", triggerComment: "/review" }));
  });

  it("returns ReviewRequest for matching comment on PR", () => {
    const result = shouldReviewGithubComment(makeCommentEvent());
    expect(result).toEqual({
      identifier: { platform: "github", owner: "octo", repo: "repo", pullNumber: 5 },
      sourceBranch: "",
      targetBranch: "",
    });
  });

  it("returns null when not in comment mode", () => {
    mockConfig.triggerMode = "all";
    expect(shouldReviewGithubComment(makeCommentEvent())).toBeNull();
  });

  it("returns null for non-created action", () => {
    expect(shouldReviewGithubComment(makeCommentEvent({ action: "deleted" }))).toBeNull();
  });

  it("returns null for comment on issue (not PR)", () => {
    expect(
      shouldReviewGithubComment(
        makeCommentEvent({ issue: { number: 5, pull_request: undefined } }),
      ),
    ).toBeNull();
  });

  it("returns null when comment body doesn't match trigger", () => {
    expect(
      shouldReviewGithubComment(
        makeCommentEvent({
          comment: { id: 100, body: "just a comment", user: { id: 1, login: "octo" } },
        }),
      ),
    ).toBeNull();
  });
});
