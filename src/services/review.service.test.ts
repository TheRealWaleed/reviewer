import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFileDiff, makeReviewResponse } from "../test-helpers/fixtures.js";
import type { ReviewResponse } from "../types/review.types.js";
import type { PlatformClient, ReviewRequest, PlatformIdentifier } from "../types/platform.types.js";
import pino from "pino";

vi.mock("../config.js", () => ({
  config: {
    gitlabToken: "test",
    gitlabUrl: "https://gitlab.com",
    anthropicApiKey: "test",
    claudeModel: "test",
    usageInputTokenCost: 0.003,
    usageOutputTokenCost: 0.015,
    usageMonthlyTokenLimit: 0,
    usageMonthlyDollarLimit: 0,
    usageDataDir: "/tmp/test",
    usageAlertWebhookUrl: "",
    logLevel: "silent",
  },
}));
vi.mock("../logger.js", () => ({
  logger: pino({ level: "silent" }),
}));

const mockGetReview = vi.fn();
const mockDetectTechStack = vi.fn();
const mockRecordUsage = vi.fn();

vi.mock("../clients/claude.client.js", () => ({
  getReview: (...args: unknown[]) => mockGetReview(...args),
}));

vi.mock("./tech-detector.service.js", () => ({
  detectTechStack: (...args: unknown[]) => mockDetectTechStack(...args),
}));

vi.mock("./usage.service.js", () => ({
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}));

const { reviewMergeRequest } = await import("./review.service.js");

const log = pino({ level: "silent" });

const gitlabId: PlatformIdentifier = { platform: "gitlab", projectId: 42, mrIid: 10 };
const req: ReviewRequest = { identifier: gitlabId, sourceBranch: "feat", targetBranch: "main" };

const mockGetChanges = vi.fn();
const mockGetCommentPositionContext = vi.fn();
const mockGetFileContent = vi.fn();
const mockGetBranchInfo = vi.fn();
const mockPostInlineComment = vi.fn();
const mockPostSummaryComment = vi.fn();
const mockCheckConnection = vi.fn();

const mockClient: PlatformClient = {
  getChanges: mockGetChanges,
  getCommentPositionContext: mockGetCommentPositionContext,
  getFileContent: mockGetFileContent,
  getBranchInfo: mockGetBranchInfo,
  postInlineComment: mockPostInlineComment,
  postSummaryComment: mockPostSummaryComment,
  checkConnection: mockCheckConnection,
};

beforeEach(() => {
  mockGetChanges.mockReset();
  mockGetCommentPositionContext.mockReset();
  mockGetFileContent.mockReset();
  mockGetBranchInfo.mockReset();
  mockPostInlineComment.mockReset();
  mockPostSummaryComment.mockReset();
  mockGetReview.mockReset();
  mockDetectTechStack.mockReset();
  mockRecordUsage.mockReset();
  mockPostInlineComment.mockResolvedValue(undefined);
  mockPostSummaryComment.mockResolvedValue(undefined);
  mockGetBranchInfo.mockResolvedValue({ sourceBranch: "feat", targetBranch: "main" });
  mockDetectTechStack.mockResolvedValue({
    languages: ["TypeScript"],
    frameworks: [],
    buildTools: [],
  });
});

function setupStandardMocks(review?: ReviewResponse) {
  mockGetChanges.mockResolvedValue([makeFileDiff()]);
  mockGetCommentPositionContext.mockResolvedValue({
    platform: "gitlab",
    baseSha: "def",
    startSha: "ghi",
    headSha: "abc",
  });
  mockGetReview.mockResolvedValue(review ?? makeReviewResponse());
}

describe("reviewMergeRequest", () => {
  it("posts failure note when review throws", async () => {
    mockGetChanges.mockRejectedValue(new Error("API down"));
    await reviewMergeRequest(mockClient, req, log);
    expect(mockPostSummaryComment).toHaveBeenCalledOnce();
    const noteBody = mockPostSummaryComment.mock.calls[0][1] as string;
    expect(noteBody).toContain("AI Code Review Failed");
  });

  it("handles failure note post error gracefully", async () => {
    mockGetChanges.mockRejectedValue(new Error("API down"));
    mockPostSummaryComment.mockRejectedValue(new Error("Post also failed"));
    await expect(reviewMergeRequest(mockClient, req, log)).resolves.toBeUndefined();
  });

  it("skips review when no changes", async () => {
    mockGetChanges.mockResolvedValue([]);
    await reviewMergeRequest(mockClient, req, log);
    expect(mockGetReview).not.toHaveBeenCalled();
    expect(mockPostSummaryComment).not.toHaveBeenCalled();
  });

  it("skips review when no position context", async () => {
    mockGetChanges.mockResolvedValue([makeFileDiff()]);
    mockGetCommentPositionContext.mockRejectedValue(new Error("No diff versions found"));
    await reviewMergeRequest(mockClient, req, log);
    expect(mockGetReview).not.toHaveBeenCalled();
  });

  it("processes single chunk and posts comments + summary", async () => {
    const review = makeReviewResponse({
      comments: [{ file: "src/app.ts", line: 2, severity: "minor", comment: "Nit" }],
    });
    setupStandardMocks(review);
    await reviewMergeRequest(mockClient, req, log);
    expect(mockGetReview).toHaveBeenCalledOnce();
    expect(mockPostInlineComment).toHaveBeenCalledOnce();
    expect(mockPostSummaryComment).toHaveBeenCalledOnce();
  });

  it("skips chunks with only deleted files", async () => {
    mockGetChanges.mockResolvedValue([makeFileDiff({ isDeleted: true, diff: "" })]);
    mockGetCommentPositionContext.mockResolvedValue({
      platform: "gitlab",
      baseSha: "def",
      startSha: "ghi",
      headSha: "abc",
    });
    await reviewMergeRequest(mockClient, req, log);
    expect(mockGetReview).not.toHaveBeenCalled();
    // Summary should still be posted
    expect(mockPostSummaryComment).toHaveBeenCalledOnce();
  });

  it("uses correct oldPath for renamed files", async () => {
    const changes = [
      makeFileDiff({
        oldPath: "src/old.ts",
        newPath: "src/new.ts",
        isRenamed: true,
        diff: "@@ -1 +1 @@\n-old\n+new\n",
      }),
    ];
    mockGetChanges.mockResolvedValue(changes);
    mockGetCommentPositionContext.mockResolvedValue({
      platform: "gitlab",
      baseSha: "def",
      startSha: "ghi",
      headSha: "abc",
    });
    mockGetReview.mockResolvedValue(
      makeReviewResponse({
        comments: [{ file: "src/new.ts", line: 1, severity: "minor", comment: "Check rename" }],
      }),
    );
    await reviewMergeRequest(mockClient, req, log);
    // oldPath should be passed as the 6th argument
    const oldPathArg = mockPostInlineComment.mock.calls[0][5];
    expect(oldPathArg).toBe("src/old.ts");
  });

  it("resolves branches when targetBranch is empty (comment trigger)", async () => {
    const commentReq: ReviewRequest = {
      identifier: gitlabId,
      sourceBranch: "",
      targetBranch: "",
    };
    setupStandardMocks();
    await reviewMergeRequest(mockClient, commentReq, log);
    expect(mockGetBranchInfo).toHaveBeenCalledWith(gitlabId);
    expect(mockDetectTechStack).toHaveBeenCalled();
    // Verify resolved targetBranch was passed to detectTechStack
    expect(mockDetectTechStack.mock.calls[0][2]).toBe("main");
  });

  it("does not call getBranchInfo when branches are provided", async () => {
    setupStandardMocks();
    await reviewMergeRequest(mockClient, req, log);
    expect(mockGetBranchInfo).not.toHaveBeenCalled();
  });

  it("escalates approval: request_changes > comment > approve", async () => {
    const changes = [
      makeFileDiff({ newPath: "a.ts", oldPath: "a.ts", diff: "x".repeat(80_000) }),
      makeFileDiff({ newPath: "b.ts", oldPath: "b.ts", diff: "y".repeat(80_000) }),
    ];
    mockGetChanges.mockResolvedValue(changes);
    mockGetCommentPositionContext.mockResolvedValue({
      platform: "gitlab",
      baseSha: "def",
      startSha: "ghi",
      headSha: "abc",
    });
    mockGetReview
      .mockResolvedValueOnce(makeReviewResponse({ approval: "comment" }))
      .mockResolvedValueOnce(makeReviewResponse({ approval: "request_changes" }));
    await reviewMergeRequest(mockClient, req, log);
    const summaryNote = mockPostSummaryComment.mock.calls[0][1] as string;
    expect(summaryNote).toContain("request changes");
  });
});
