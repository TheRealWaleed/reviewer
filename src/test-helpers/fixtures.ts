import type {
  GitLabMRChange,
  GitLabMergeRequestHook,
  GitLabNoteHook,
} from "../types/gitlab.types.js";
import type { ReviewResponse } from "../types/review.types.js";
import type { Config } from "../types/config.types.js";
import type { UsageSnapshot } from "../types/usage.types.js";
import type { FileDiff } from "../types/platform.types.js";

export function makeChange(overrides?: Partial<GitLabMRChange>): GitLabMRChange {
  return {
    old_path: "src/app.ts",
    new_path: "src/app.ts",
    a_mode: "100644",
    b_mode: "100644",
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    diff: "@@ -1,3 +1,4 @@\n import express from 'express';\n+import cors from 'cors';\n const app = express();\n",
    ...overrides,
  };
}

export function makeFileDiff(overrides?: Partial<FileDiff>): FileDiff {
  return {
    oldPath: "src/app.ts",
    newPath: "src/app.ts",
    isNewFile: false,
    isDeleted: false,
    isRenamed: false,
    diff: "@@ -1,3 +1,4 @@\n import express from 'express';\n+import cors from 'cors';\n const app = express();\n",
    ...overrides,
  };
}

export function makeMRHookPayload(
  overrides?: Partial<GitLabMergeRequestHook>,
): GitLabMergeRequestHook {
  return {
    object_kind: "merge_request",
    event_type: "merge_request",
    user: {
      id: 1,
      name: "Test User",
      username: "testuser",
      avatar_url: "https://example.com/avatar.png",
    },
    project: {
      id: 42,
      name: "test-project",
      web_url: "https://gitlab.com/test/test-project",
      path_with_namespace: "test/test-project",
      default_branch: "main",
    },
    object_attributes: {
      id: 100,
      iid: 10,
      title: "Test MR",
      description: "Test description",
      state: "opened",
      action: "open",
      source_branch: "feature-branch",
      target_branch: "main",
      last_commit: { id: "abc123", message: "feat: add feature" },
    },
    labels: [],
    changes: {},
    ...overrides,
  };
}

export function makeNoteHookPayload(overrides?: Partial<GitLabNoteHook>): GitLabNoteHook {
  return {
    object_kind: "note",
    event_type: "note",
    user: {
      id: 1,
      name: "Test User",
      username: "testuser",
      avatar_url: "https://example.com/avatar.png",
    },
    project: {
      id: 42,
      name: "test-project",
      web_url: "https://gitlab.com/test/test-project",
      path_with_namespace: "test/test-project",
      default_branch: "main",
    },
    merge_request: {
      id: 100,
      iid: 10,
      title: "Test MR",
      description: "Test description",
      state: "opened",
      source_branch: "feature-branch",
      target_branch: "main",
      last_commit: { id: "abc123", message: "feat: add feature" },
    },
    object_attributes: {
      id: 200,
      note: "/review",
      noteable_type: "MergeRequest",
      noteable_id: 100,
    },
    ...overrides,
  };
}

export function makeReviewResponse(overrides?: Partial<ReviewResponse>): ReviewResponse {
  return {
    summary: "Code looks good overall.",
    comments: [],
    approval: "approve",
    ...overrides,
  };
}

export function makeConfig(overrides?: Partial<Config>): Config {
  return {
    port: 3000,
    host: "0.0.0.0",
    gitlabToken: "test-gitlab-token",
    gitlabUrl: "https://gitlab.com",
    gitlabWebhookSecret: "test-secret",
    anthropicApiKey: "test-anthropic-key",
    claudeModel: "claude-sonnet-4-5-20250929",
    triggerMode: "all",
    triggerLabel: "ai-review",
    triggerComment: "/review",
    logLevel: "silent",
    usageMonthlyTokenLimit: 0,
    usageMonthlyDollarLimit: 0,
    usageInputTokenCost: 0.003,
    usageOutputTokenCost: 0.015,
    usageAlertWebhookUrl: "",
    usageDataDir: "/tmp/test-usage",
    healthCheckTimeoutMs: 5000,
    githubToken: "",
    githubWebhookSecret: "",
    ...overrides,
  };
}

export function makeUsageSnapshot(overrides?: Partial<UsageSnapshot>): UsageSnapshot {
  return {
    currentMonth: {
      month: new Date().toISOString().slice(0, 7),
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: 0.0105,
      requestCount: 1,
    },
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}
