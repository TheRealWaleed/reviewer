import { z } from "zod";
import { config } from "../config.js";
import type { GitLabConfig } from "../types/config.types.js";
import { withRetry } from "../utils/retry.js";
import {
  GitLabMRChangesResponseSchema,
  GitLabMRVersionsSchema,
  GitLabFileContentSchema,
} from "../types/gitlab.types.js";
import type {
  GitLabMRChangesResponse,
  GitLabMRVersions,
  GitLabDiffPosition,
} from "../types/gitlab.types.js";

const cfg: GitLabConfig = config;

const headers = {
  "PRIVATE-TOKEN": cfg.gitlabToken,
  "Content-Type": "application/json",
};

const apiUrl = `${cfg.gitlabUrl}/api/v4`;

export class GitLabApiError extends Error {
  constructor(
    public readonly statusCode: number,
    path: string,
    body: string,
  ) {
    super(`GitLab API error ${statusCode} on ${path}: ${body}`);
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, options?: RequestInit): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new GitLabApiError(res.status, path, body);
    }
    const json: unknown = await res.json();
    return schema.parse(json);
  });
}

async function requestVoid(path: string, options?: RequestInit): Promise<void> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GitLabApiError(res.status, path, body);
  }
}

export async function getMRChanges(
  projectId: number,
  mrIid: number,
): Promise<GitLabMRChangesResponse> {
  return request(
    `/projects/${projectId}/merge_requests/${mrIid}/changes`,
    GitLabMRChangesResponseSchema,
  );
}

export async function getMRVersions(projectId: number, mrIid: number): Promise<GitLabMRVersions[]> {
  return request(
    `/projects/${projectId}/merge_requests/${mrIid}/versions`,
    z.array(GitLabMRVersionsSchema),
  );
}

export async function getFileContent(
  projectId: number,
  filePath: string,
  ref: string,
): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(filePath);
    const data = await request(
      `/projects/${projectId}/repository/files/${encoded}?ref=${encodeURIComponent(ref)}`,
      GitLabFileContentSchema,
    );
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch (err) {
    if (err instanceof GitLabApiError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

export async function postInlineComment(
  projectId: number,
  mrIid: number,
  position: GitLabDiffPosition,
  body: string,
): Promise<void> {
  await requestVoid(`/projects/${projectId}/merge_requests/${mrIid}/discussions`, {
    method: "POST",
    body: JSON.stringify({ body, position }),
  });
}

export async function postMRNote(projectId: number, mrIid: number, body: string): Promise<void> {
  await requestVoid(`/projects/${projectId}/merge_requests/${mrIid}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function checkGitLabConnection(signal?: AbortSignal): Promise<void> {
  await withRetry(async () => {
    const res = await fetch(`${apiUrl}/personal_access_tokens/self`, {
      headers,
      signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new GitLabApiError(res.status, "/personal_access_tokens/self", body);
    }
  });
}
