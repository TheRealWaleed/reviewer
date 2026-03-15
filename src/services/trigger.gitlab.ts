import { config } from "../config.js";
import type { TriggerConfig } from "../types/config.types.js";
import type { GitLabMergeRequestHook, WebhookPayload } from "../types/gitlab.types.js";
import type { ReviewRequest } from "../types/platform.types.js";

const cfg: TriggerConfig = config;

export function shouldReviewGitlab(
  eventType: string,
  payload: WebhookPayload,
): ReviewRequest | null {
  if (cfg.triggerMode === "comment") {
    return handleCommentTrigger(eventType, payload);
  }

  if (eventType !== "Merge Request Hook") return null;
  if (payload.object_kind !== "merge_request") return null;

  const action = payload.object_attributes.action;
  if (action !== "open" && action !== "update") return null;

  if (cfg.triggerMode === "label") {
    return handleLabelTrigger(payload);
  }

  // mode === "all"
  return extractReviewRequest(payload.project.id, payload.object_attributes);
}

function handleLabelTrigger(payload: GitLabMergeRequestHook): ReviewRequest | null {
  const labels = payload.labels ?? payload.object_attributes.labels ?? [];
  const hasLabel = labels.some((l) => l.title === cfg.triggerLabel);
  if (!hasLabel) return null;
  return extractReviewRequest(payload.project.id, payload.object_attributes);
}

function handleCommentTrigger(eventType: string, payload: WebhookPayload): ReviewRequest | null {
  if (eventType !== "Note Hook") return null;
  if (payload.object_kind !== "note") return null;

  if (payload.object_attributes.noteable_type !== "MergeRequest") return null;
  if (!payload.object_attributes.note.trim().startsWith(cfg.triggerComment)) return null;

  const mr = payload.merge_request;
  return {
    identifier: { platform: "gitlab", projectId: payload.project.id, mrIid: mr.iid },
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
  };
}

function extractReviewRequest(
  projectId: number,
  mr: GitLabMergeRequestHook["object_attributes"],
): ReviewRequest {
  return {
    identifier: { platform: "gitlab", projectId, mrIid: mr.iid },
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
  };
}
