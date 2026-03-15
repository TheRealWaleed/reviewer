import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlatformIdentifier } from "../types/platform.types.js";

const mockListFiles = vi.fn();
const mockPullsGet = vi.fn();
const mockGetContent = vi.fn();
const mockCreateReviewComment = vi.fn();
const mockCreateComment = vi.fn();
const mockGetAuthenticated = vi.fn();

vi.mock("../config.js", () => ({
  config: { githubToken: "test-token", githubWebhookSecret: "test-secret" },
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    pulls = {
      listFiles: (...args: unknown[]) => mockListFiles(...args),
      get: (...args: unknown[]) => mockPullsGet(...args),
      createReviewComment: (...args: unknown[]) => mockCreateReviewComment(...args),
    };
    repos = {
      getContent: (...args: unknown[]) => mockGetContent(...args),
    };
    issues = {
      createComment: (...args: unknown[]) => mockCreateComment(...args),
    };
    users = {
      getAuthenticated: (...args: unknown[]) => mockGetAuthenticated(...args),
    };
  },
}));

const { GitHubPlatformClient } = await import("./github.client.js");

const githubId: PlatformIdentifier = {
  platform: "github",
  owner: "octo",
  repo: "repo",
  pullNumber: 5,
};
const gitlabId: PlatformIdentifier = { platform: "gitlab", projectId: 42, mrIid: 10 };

let client: InstanceType<typeof GitHubPlatformClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = new GitHubPlatformClient();
});

describe("GitHubPlatformClient", () => {
  describe("getChanges", () => {
    it("maps PR files to FileDiff", async () => {
      mockListFiles.mockResolvedValue({
        data: [
          {
            filename: "src/app.ts",
            status: "modified",
            patch: "@@ +1 @@\n+hello",
            previous_filename: undefined,
            sha: "abc",
          },
          {
            filename: "src/new.ts",
            status: "added",
            patch: "@@ +1 @@\n+new",
            previous_filename: undefined,
            sha: "def",
          },
          {
            filename: "src/gone.ts",
            status: "removed",
            patch: "@@ -1 @@\n-bye",
            previous_filename: undefined,
            sha: "ghi",
          },
          {
            filename: "src/renamed.ts",
            status: "renamed",
            patch: "@@ +1 @@\n+renamed",
            previous_filename: "src/old.ts",
            sha: "jkl",
          },
        ],
      });
      const files = await client.getChanges(githubId);
      expect(files).toHaveLength(4);
      expect(files[0]).toEqual({
        oldPath: "src/app.ts",
        newPath: "src/app.ts",
        isNewFile: false,
        isDeleted: false,
        isRenamed: false,
        diff: "@@ +1 @@\n+hello",
      });
      expect(files[1].isNewFile).toBe(true);
      expect(files[2].isDeleted).toBe(true);
      expect(files[3].isRenamed).toBe(true);
      expect(files[3].oldPath).toBe("src/old.ts");
    });

    it("paginates when full page returned", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        filename: `file${i}.ts`,
        status: "modified",
        patch: "+x",
        sha: `sha${i}`,
      }));
      const page2 = [{ filename: "last.ts", status: "modified", patch: "+y", sha: "shalast" }];
      mockListFiles.mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: page2 });
      const files = await client.getChanges(githubId);
      expect(files).toHaveLength(101);
      expect(mockListFiles).toHaveBeenCalledTimes(2);
    });

    it("throws for non-github identifier", async () => {
      await expect(client.getChanges(gitlabId)).rejects.toThrow("Expected github identifier");
    });
  });

  describe("getCommentPositionContext", () => {
    it("returns commit SHA from PR head", async () => {
      mockPullsGet.mockResolvedValue({
        data: { head: { sha: "abc123" }, base: { sha: "def456" } },
      });
      const ctx = await client.getCommentPositionContext(githubId);
      expect(ctx).toEqual({ platform: "github", commitSha: "abc123" });
    });
  });

  describe("getBranchInfo", () => {
    it("returns source and target branch from PR", async () => {
      mockPullsGet.mockResolvedValue({
        data: {
          head: { sha: "abc123", ref: "feature-branch" },
          base: { sha: "def456", ref: "main" },
        },
      });
      const result = await client.getBranchInfo(githubId);
      expect(result).toEqual({ sourceBranch: "feature-branch", targetBranch: "main" });
    });

    it("throws for non-github identifier", async () => {
      await expect(client.getBranchInfo(gitlabId)).rejects.toThrow("Expected github identifier");
    });
  });

  describe("getFileContent", () => {
    it("decodes base64 file content", async () => {
      mockGetContent.mockResolvedValue({
        data: { content: Buffer.from("hello world").toString("base64"), encoding: "base64" },
      });
      const result = await client.getFileContent(githubId, "package.json", "main");
      expect(result).toBe("hello world");
    });

    it("returns null on 404", async () => {
      mockGetContent.mockRejectedValue({ status: 404 });
      const result = await client.getFileContent(githubId, "missing.json", "main");
      expect(result).toBeNull();
    });

    it("throws on non-404 errors", async () => {
      mockGetContent.mockRejectedValue({ status: 500, message: "Server error" });
      await expect(client.getFileContent(githubId, "file.ts", "main")).rejects.toEqual({
        status: 500,
        message: "Server error",
      });
    });
  });

  describe("postInlineComment", () => {
    it("creates review comment with correct params", async () => {
      mockCreateReviewComment.mockResolvedValue({ data: {} });
      const ctx = { platform: "github" as const, commitSha: "abc123" };
      await client.postInlineComment(githubId, ctx, "src/app.ts", 10, "Fix this");
      expect(mockCreateReviewComment).toHaveBeenCalledWith({
        owner: "octo",
        repo: "repo",
        pull_number: 5,
        commit_id: "abc123",
        path: "src/app.ts",
        line: 10,
        side: "RIGHT",
        body: "Fix this",
      });
    });
  });

  describe("postSummaryComment", () => {
    it("creates issue comment", async () => {
      mockCreateComment.mockResolvedValue({ data: {} });
      await client.postSummaryComment(githubId, "Summary text");
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: "octo",
        repo: "repo",
        issue_number: 5,
        body: "Summary text",
      });
    });
  });

  describe("checkConnection", () => {
    it("calls getAuthenticated", async () => {
      mockGetAuthenticated.mockResolvedValue({ data: {} });
      await client.checkConnection();
      expect(mockGetAuthenticated).toHaveBeenCalled();
    });
  });
});
