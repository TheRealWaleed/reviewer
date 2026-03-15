import { z } from "zod";

// --- Webhook payload schemas ---

export const GitHubUserSchema = z
  .object({
    id: z.number(),
    login: z.string(),
  })
  .passthrough();

export const GitHubRepoSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: GitHubUserSchema,
  })
  .passthrough();

export const GitHubPullRequestSchema = z
  .object({
    number: z.number(),
    title: z.string(),
    state: z.string(),
    head: z.object({ sha: z.string(), ref: z.string() }).passthrough(),
    base: z.object({ sha: z.string(), ref: z.string() }).passthrough(),
  })
  .passthrough();

export const GitHubPullRequestEventSchema = z
  .object({
    action: z.string(),
    pull_request: GitHubPullRequestSchema,
    repository: GitHubRepoSchema,
    label: z.object({ name: z.string() }).passthrough().optional(),
  })
  .passthrough();

export const GitHubIssueCommentEventSchema = z
  .object({
    action: z.string(),
    issue: z
      .object({
        number: z.number(),
        pull_request: z.object({ url: z.string() }).passthrough().optional(),
      })
      .passthrough(),
    comment: z
      .object({
        id: z.number(),
        body: z.string(),
        user: GitHubUserSchema,
      })
      .passthrough(),
    repository: GitHubRepoSchema,
  })
  .passthrough();

// --- API response schemas ---

export const GitHubPRFileSchema = z
  .object({
    sha: z.string(),
    filename: z.string(),
    status: z.string(),
    patch: z.string().optional(),
    previous_filename: z.string().optional(),
  })
  .passthrough();

// --- Derived types ---

export type GitHubUser = z.infer<typeof GitHubUserSchema>;
export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubPullRequestEvent = z.infer<typeof GitHubPullRequestEventSchema>;
export type GitHubIssueCommentEvent = z.infer<typeof GitHubIssueCommentEventSchema>;
export type GitHubPRFile = z.infer<typeof GitHubPRFileSchema>;
