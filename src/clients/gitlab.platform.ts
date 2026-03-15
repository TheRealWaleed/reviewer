import type {
  PlatformClient,
  PlatformIdentifier,
  FileDiff,
  CommentPositionContext,
} from "../types/platform.types.js";
import type { GitLabDiffPosition } from "../types/gitlab.types.js";
import {
  getMRChanges,
  getMRVersions,
  getFileContent as gitlabGetFileContent,
  postInlineComment as gitlabPostInlineComment,
  postMRNote,
  checkGitLabConnection,
} from "./gitlab.client.js";

function assertGitLab(
  id: PlatformIdentifier,
): asserts id is Extract<PlatformIdentifier, { platform: "gitlab" }> {
  if (id.platform !== "gitlab") {
    throw new Error(`Expected gitlab identifier, got ${id.platform}`);
  }
}

export class GitLabPlatformClient implements PlatformClient {
  async getChanges(id: PlatformIdentifier): Promise<FileDiff[]> {
    assertGitLab(id);
    const mrData = await getMRChanges(id.projectId, id.mrIid);
    return mrData.changes.map((c) => ({
      oldPath: c.old_path,
      newPath: c.new_path,
      isNewFile: c.new_file,
      isDeleted: c.deleted_file,
      isRenamed: c.renamed_file,
      diff: c.diff,
    }));
  }

  async getCommentPositionContext(id: PlatformIdentifier): Promise<CommentPositionContext> {
    assertGitLab(id);
    const versions = await getMRVersions(id.projectId, id.mrIid);
    const latest = versions[0];
    if (!latest) {
      throw new Error("No diff versions found");
    }
    return {
      platform: "gitlab",
      baseSha: latest.base_commit_sha,
      startSha: latest.start_commit_sha,
      headSha: latest.head_commit_sha,
    };
  }

  async getBranchInfo(
    id: PlatformIdentifier,
  ): Promise<{ sourceBranch: string; targetBranch: string }> {
    assertGitLab(id);
    const mrData = await getMRChanges(id.projectId, id.mrIid);
    return {
      sourceBranch: mrData.source_branch,
      targetBranch: mrData.target_branch,
    };
  }

  async getFileContent(
    id: PlatformIdentifier,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    assertGitLab(id);
    return gitlabGetFileContent(id.projectId, filePath, ref);
  }

  async postInlineComment(
    id: PlatformIdentifier,
    ctx: CommentPositionContext,
    file: string,
    line: number,
    body: string,
    oldPath?: string,
  ): Promise<void> {
    assertGitLab(id);
    if (ctx.platform !== "gitlab") {
      throw new Error("Expected gitlab context");
    }
    const position: GitLabDiffPosition = {
      base_sha: ctx.baseSha,
      start_sha: ctx.startSha,
      head_sha: ctx.headSha,
      position_type: "text",
      old_path: oldPath ?? file,
      new_path: file,
      new_line: line,
    };
    await gitlabPostInlineComment(id.projectId, id.mrIid, position, body);
  }

  async postSummaryComment(id: PlatformIdentifier, body: string): Promise<void> {
    assertGitLab(id);
    await postMRNote(id.projectId, id.mrIid, body);
  }

  async checkConnection(signal?: AbortSignal): Promise<void> {
    await checkGitLabConnection(signal);
  }
}
