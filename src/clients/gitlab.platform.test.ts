import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlatformIdentifier } from "../types/platform.types.js";

vi.mock("../config.js", () => ({
  config: { gitlabToken: "test", gitlabUrl: "https://gitlab.com" },
}));

const mockGetMRChanges = vi.fn();
const mockGetMRVersions = vi.fn();
const mockGetFileContent = vi.fn();
const mockPostInlineComment = vi.fn();
const mockPostMRNote = vi.fn();
const mockCheckGitLabConnection = vi.fn();

vi.mock("./gitlab.client.js", () => ({
  getMRChanges: (...args: unknown[]) => mockGetMRChanges(...args),
  getMRVersions: (...args: unknown[]) => mockGetMRVersions(...args),
  getFileContent: (...args: unknown[]) => mockGetFileContent(...args),
  postInlineComment: (...args: unknown[]) => mockPostInlineComment(...args),
  postMRNote: (...args: unknown[]) => mockPostMRNote(...args),
  checkGitLabConnection: (...args: unknown[]) => mockCheckGitLabConnection(...args),
}));

const { GitLabPlatformClient } = await import("./gitlab.platform.js");

const gitlabId: PlatformIdentifier = { platform: "gitlab", projectId: 42, mrIid: 10 };
const githubId: PlatformIdentifier = { platform: "github", owner: "o", repo: "r", pullNumber: 1 };

let client: InstanceType<typeof GitLabPlatformClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = new GitLabPlatformClient();
});

describe("GitLabPlatformClient", () => {
  describe("getChanges", () => {
    it("maps GitLabMRChange to FileDiff", async () => {
      mockGetMRChanges.mockResolvedValue({
        changes: [
          {
            old_path: "src/old.ts",
            new_path: "src/new.ts",
            new_file: false,
            deleted_file: false,
            renamed_file: true,
            diff: "@@ -1 +1 @@\n-old\n+new\n",
            a_mode: "100644",
            b_mode: "100644",
          },
        ],
      });
      const changes = await client.getChanges(gitlabId);
      expect(changes).toEqual([
        {
          oldPath: "src/old.ts",
          newPath: "src/new.ts",
          isNewFile: false,
          isDeleted: false,
          isRenamed: true,
          diff: "@@ -1 +1 @@\n-old\n+new\n",
        },
      ]);
      expect(mockGetMRChanges).toHaveBeenCalledWith(42, 10);
    });

    it("throws for non-gitlab identifier", async () => {
      await expect(client.getChanges(githubId)).rejects.toThrow("Expected gitlab identifier");
    });
  });

  describe("getCommentPositionContext", () => {
    it("returns SHA triple from latest version", async () => {
      mockGetMRVersions.mockResolvedValue([
        { id: 1, head_commit_sha: "head", base_commit_sha: "base", start_commit_sha: "start" },
      ]);
      const ctx = await client.getCommentPositionContext(gitlabId);
      expect(ctx).toEqual({
        platform: "gitlab",
        baseSha: "base",
        startSha: "start",
        headSha: "head",
      });
    });

    it("throws when no versions found", async () => {
      mockGetMRVersions.mockResolvedValue([]);
      await expect(client.getCommentPositionContext(gitlabId)).rejects.toThrow(
        "No diff versions found",
      );
    });
  });

  describe("getFileContent", () => {
    it("delegates to gitlab client", async () => {
      mockGetFileContent.mockResolvedValue("file content");
      const result = await client.getFileContent(gitlabId, "package.json", "main");
      expect(result).toBe("file content");
      expect(mockGetFileContent).toHaveBeenCalledWith(42, "package.json", "main");
    });
  });

  describe("postInlineComment", () => {
    it("constructs GitLabDiffPosition and delegates", async () => {
      mockPostInlineComment.mockResolvedValue(undefined);
      const ctx = { platform: "gitlab" as const, baseSha: "b", startSha: "s", headSha: "h" };
      await client.postInlineComment(gitlabId, ctx, "src/app.ts", 5, "comment body", "src/old.ts");
      expect(mockPostInlineComment).toHaveBeenCalledWith(
        42,
        10,
        {
          base_sha: "b",
          start_sha: "s",
          head_sha: "h",
          position_type: "text",
          old_path: "src/old.ts",
          new_path: "src/app.ts",
          new_line: 5,
        },
        "comment body",
      );
    });

    it("uses file as old_path when oldPath not provided", async () => {
      mockPostInlineComment.mockResolvedValue(undefined);
      const ctx = { platform: "gitlab" as const, baseSha: "b", startSha: "s", headSha: "h" };
      await client.postInlineComment(gitlabId, ctx, "src/app.ts", 5, "body");
      const position = mockPostInlineComment.mock.calls[0][2];
      expect(position.old_path).toBe("src/app.ts");
    });
  });

  describe("postSummaryComment", () => {
    it("delegates to postMRNote", async () => {
      mockPostMRNote.mockResolvedValue(undefined);
      await client.postSummaryComment(gitlabId, "summary");
      expect(mockPostMRNote).toHaveBeenCalledWith(42, 10, "summary");
    });
  });

  describe("checkConnection", () => {
    it("delegates to checkGitLabConnection", async () => {
      mockCheckGitLabConnection.mockResolvedValue(undefined);
      await client.checkConnection();
      expect(mockCheckGitLabConnection).toHaveBeenCalled();
    });
  });
});
