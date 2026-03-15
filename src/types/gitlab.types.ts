import { z } from "zod";

// --- Shared sub-schemas ---

export const GitLabUserSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    username: z.string(),
    avatar_url: z.string(),
  })
  .passthrough();

export const GitLabProjectSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    web_url: z.string(),
    path_with_namespace: z.string(),
    default_branch: z.string(),
  })
  .passthrough();

export const GitLabLabelSchema = z
  .object({
    id: z.number(),
    title: z.string(),
  })
  .passthrough();

export const GitLabMergeRequestAttributesSchema = z
  .object({
    id: z.number(),
    iid: z.number(),
    title: z.string(),
    description: z.string().nullable().default(""),
    state: z.string(),
    action: z.string().optional(),
    source_branch: z.string(),
    target_branch: z.string(),
    labels: z.array(GitLabLabelSchema).optional(),
    last_commit: z
      .object({
        id: z.string(),
        message: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

export const GitLabNoteAttributesSchema = z
  .object({
    id: z.number(),
    note: z.string(),
    noteable_type: z.string(),
    noteable_id: z.number(),
  })
  .passthrough();

// --- Webhook payload schemas (discriminated union on object_kind) ---

export const GitLabMergeRequestHookSchema = z
  .object({
    object_kind: z.literal("merge_request"),
    event_type: z.literal("merge_request"),
    user: GitLabUserSchema,
    project: GitLabProjectSchema,
    object_attributes: GitLabMergeRequestAttributesSchema,
    labels: z.array(GitLabLabelSchema),
    changes: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const GitLabNoteHookSchema = z
  .object({
    object_kind: z.literal("note"),
    event_type: z.literal("note"),
    user: GitLabUserSchema,
    project: GitLabProjectSchema,
    merge_request: GitLabMergeRequestAttributesSchema,
    object_attributes: GitLabNoteAttributesSchema,
  })
  .passthrough();

export const WebhookPayloadSchema = z.discriminatedUnion("object_kind", [
  GitLabMergeRequestHookSchema,
  GitLabNoteHookSchema,
]);

// --- GitLab API response schemas (passthrough — only validate what we use) ---

export const GitLabMRChangeSchema = z
  .object({
    old_path: z.string(),
    new_path: z.string(),
    a_mode: z.string(),
    b_mode: z.string(),
    new_file: z.boolean(),
    renamed_file: z.boolean(),
    deleted_file: z.boolean(),
    diff: z.string(),
  })
  .passthrough();

export const GitLabMRChangesResponseSchema = z
  .object({
    id: z.number(),
    iid: z.number(),
    title: z.string(),
    description: z.string().nullable().default(""),
    source_branch: z.string(),
    target_branch: z.string(),
    changes: z.array(GitLabMRChangeSchema),
  })
  .passthrough();

export const GitLabDiffPositionSchema = z.object({
  base_sha: z.string(),
  start_sha: z.string(),
  head_sha: z.string(),
  position_type: z.literal("text"),
  old_path: z.string(),
  new_path: z.string(),
  new_line: z.number(),
});

export const GitLabMRVersionsSchema = z
  .object({
    id: z.number(),
    head_commit_sha: z.string(),
    base_commit_sha: z.string(),
    start_commit_sha: z.string(),
  })
  .passthrough();

export const GitLabFileContentSchema = z
  .object({
    content: z.string(),
  })
  .passthrough();

// --- Derived types ---

export type GitLabMergeRequestHook = z.infer<typeof GitLabMergeRequestHookSchema>;
export type GitLabNoteHook = z.infer<typeof GitLabNoteHookSchema>;
export type GitLabUser = z.infer<typeof GitLabUserSchema>;
export type GitLabProject = z.infer<typeof GitLabProjectSchema>;
export type GitLabMergeRequestAttributes = z.infer<typeof GitLabMergeRequestAttributesSchema>;
export type GitLabNoteAttributes = z.infer<typeof GitLabNoteAttributesSchema>;
export type GitLabLabel = z.infer<typeof GitLabLabelSchema>;
export type GitLabMRChange = z.infer<typeof GitLabMRChangeSchema>;
export type GitLabMRChangesResponse = z.infer<typeof GitLabMRChangesResponseSchema>;
export type GitLabDiffPosition = z.infer<typeof GitLabDiffPositionSchema>;
export type GitLabMRVersions = z.infer<typeof GitLabMRVersionsSchema>;
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
