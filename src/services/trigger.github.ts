import { config } from "../config.js";
import type { TriggerConfig } from "../types/config.types.js";
import type { GitHubPullRequestEvent, GitHubIssueCommentEvent } from "../types/github.types.js";
import type { ReviewRequest } from "../types/platform.types.js";

const cfg: TriggerConfig = config;

export function shouldReviewGithubPR(payload: GitHubPullRequestEvent): ReviewRequest | null {
  const action = payload.action;

  if (cfg.triggerMode === "comment") {
    // In comment mode, PR events don't trigger reviews
    return null;
  }

  if (action === "opened" || action === "synchronize") {
    if (cfg.triggerMode === "label") {
      // For label mode on opened/synchronize, check if the PR already has the label
      // GitHub sends `pull_request` payload — we don't have labels in this event easily,
      // so we only trigger on `labeled` action for label mode
      return null;
    }
    return extractReviewRequest(payload);
  }

  if (action === "labeled" && cfg.triggerMode === "label") {
    if (payload.label?.name === cfg.triggerLabel) {
      return extractReviewRequest(payload);
    }
  }

  return null;
}

export function shouldReviewGithubComment(payload: GitHubIssueCommentEvent): ReviewRequest | null {
  if (cfg.triggerMode !== "comment") return null;
  if (payload.action !== "created") return null;

  // Only trigger on PR comments (issue_comment on a PR has issue.pull_request set)
  if (!payload.issue.pull_request) return null;

  const body = payload.comment.body.trim();
  if (!body.startsWith(cfg.triggerComment)) return null;

  const repo = payload.repository;
  return {
    identifier: {
      platform: "github",
      owner: repo.owner.login,
      repo: repo.name,
      pullNumber: payload.issue.number,
    },
    // issue_comment webhook does not include PR branch info.
    // review.service.ts will resolve branches via PlatformClient.getBranchInfo().
    sourceBranch: "",
    targetBranch: "",
  };
}

function extractReviewRequest(payload: GitHubPullRequestEvent): ReviewRequest {
  const repo = payload.repository;
  return {
    identifier: {
      platform: "github",
      owner: repo.owner.login,
      repo: repo.name,
      pullNumber: payload.pull_request.number,
    },
    sourceBranch: payload.pull_request.head.ref,
    targetBranch: payload.pull_request.base.ref,
  };
}
