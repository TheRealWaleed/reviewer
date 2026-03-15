import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMRHookPayload, makeNoteHookPayload, makeConfig } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig();

vi.mock("../config.js", () => ({ config: mockConfig }));

const { shouldReviewGitlab } = await import("./trigger.gitlab.js");

describe("shouldReviewGitlab", () => {
  beforeEach(() => {
    Object.assign(mockConfig, makeConfig());
  });

  describe("mode=all", () => {
    it("returns ReviewRequest for MR open event", () => {
      const payload = makeMRHookPayload({
        object_attributes: { ...makeMRHookPayload().object_attributes, action: "open" },
      });
      const result = shouldReviewGitlab("Merge Request Hook", payload);
      expect(result).toEqual({
        identifier: { platform: "gitlab", projectId: 42, mrIid: 10 },
        sourceBranch: "feature-branch",
        targetBranch: "main",
      });
    });

    it("returns ReviewRequest for MR update event", () => {
      const payload = makeMRHookPayload({
        object_attributes: { ...makeMRHookPayload().object_attributes, action: "update" },
      });
      const result = shouldReviewGitlab("Merge Request Hook", payload);
      expect(result).not.toBeNull();
    });

    it("returns null for MR close event", () => {
      const payload = makeMRHookPayload({
        object_attributes: { ...makeMRHookPayload().object_attributes, action: "close" },
      });
      expect(shouldReviewGitlab("Merge Request Hook", payload)).toBeNull();
    });

    it("returns null for non-MR event type", () => {
      const payload = makeMRHookPayload();
      expect(shouldReviewGitlab("Push Hook", payload)).toBeNull();
    });

    it("returns null for note webhook in all mode", () => {
      const payload = makeNoteHookPayload();
      expect(shouldReviewGitlab("Note Hook", payload)).toBeNull();
    });
  });

  describe("mode=label", () => {
    beforeEach(() => {
      mockConfig.triggerMode = "label";
      mockConfig.triggerLabel = "ai-review";
    });

    it("returns ReviewRequest when trigger label present in labels", () => {
      const payload = makeMRHookPayload({
        labels: [{ id: 1, title: "ai-review" }],
      });
      const result = shouldReviewGitlab("Merge Request Hook", payload);
      expect(result).not.toBeNull();
      expect(result!.identifier).toEqual({ platform: "gitlab", projectId: 42, mrIid: 10 });
    });

    it("returns ReviewRequest when label present in object_attributes.labels (labels array absent)", () => {
      const payload = makeMRHookPayload({
        object_attributes: {
          ...makeMRHookPayload().object_attributes,
          labels: [{ id: 1, title: "ai-review" }],
        },
      });
      (payload as Record<string, unknown>).labels = undefined;
      const result = shouldReviewGitlab("Merge Request Hook", payload);
      expect(result).not.toBeNull();
    });

    it("returns null when label is missing", () => {
      const payload = makeMRHookPayload({ labels: [] });
      expect(shouldReviewGitlab("Merge Request Hook", payload)).toBeNull();
    });
  });

  describe("mode=comment", () => {
    beforeEach(() => {
      mockConfig.triggerMode = "comment";
      mockConfig.triggerComment = "/review";
    });

    it("returns ReviewRequest for matching note on MR", () => {
      const payload = makeNoteHookPayload();
      const result = shouldReviewGitlab("Note Hook", payload);
      expect(result).toEqual({
        identifier: { platform: "gitlab", projectId: 42, mrIid: 10 },
        sourceBranch: "feature-branch",
        targetBranch: "main",
      });
    });

    it("returns null when noteable_type is not MergeRequest", () => {
      const payload = makeNoteHookPayload({
        object_attributes: { ...makeNoteHookPayload().object_attributes, noteable_type: "Issue" },
      });
      expect(shouldReviewGitlab("Note Hook", payload)).toBeNull();
    });

    it("returns null when note does not start with trigger comment", () => {
      const payload = makeNoteHookPayload({
        object_attributes: { ...makeNoteHookPayload().object_attributes, note: "just a comment" },
      });
      expect(shouldReviewGitlab("Note Hook", payload)).toBeNull();
    });

    it("returns null for non-Note event type", () => {
      const payload = makeNoteHookPayload();
      expect(shouldReviewGitlab("Merge Request Hook", payload)).toBeNull();
    });
  });
});
