import { Octokit } from "@octokit/rest";
import { config } from "../config.js";
import { withRetry } from "../utils/retry.js";
import type {
  PlatformClient,
  PlatformIdentifier,
  FileDiff,
  CommentPositionContext,
} from "../types/platform.types.js";

function assertGitHub(
  id: PlatformIdentifier,
): asserts id is Extract<PlatformIdentifier, { platform: "github" }> {
  if (id.platform !== "github") {
    throw new Error(`Expected github identifier, got ${id.platform}`);
  }
}

export class GitHubPlatformClient implements PlatformClient {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({ auth: token ?? config.githubToken });
  }

  async getChanges(id: PlatformIdentifier): Promise<FileDiff[]> {
    assertGitHub(id);
    const files: FileDiff[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const res = await withRetry(() =>
        this.octokit.pulls.listFiles({
          owner: id.owner,
          repo: id.repo,
          pull_number: id.pullNumber,
          per_page: perPage,
          page,
        }),
      );

      for (const f of res.data) {
        files.push({
          oldPath: f.previous_filename ?? f.filename,
          newPath: f.filename,
          isNewFile: f.status === "added",
          isDeleted: f.status === "removed",
          isRenamed: f.status === "renamed",
          diff: f.patch ?? "",
        });
      }

      if (res.data.length < perPage) break;
      page++;
    }

    return files;
  }

  async getCommentPositionContext(id: PlatformIdentifier): Promise<CommentPositionContext> {
    assertGitHub(id);
    const { data: pr } = await withRetry(() =>
      this.octokit.pulls.get({
        owner: id.owner,
        repo: id.repo,
        pull_number: id.pullNumber,
      }),
    );
    return {
      platform: "github",
      commitSha: pr.head.sha,
    };
  }

  async getBranchInfo(
    id: PlatformIdentifier,
  ): Promise<{ sourceBranch: string; targetBranch: string }> {
    assertGitHub(id);
    const { data: pr } = await withRetry(() =>
      this.octokit.pulls.get({
        owner: id.owner,
        repo: id.repo,
        pull_number: id.pullNumber,
      }),
    );
    return {
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
    };
  }

  async getFileContent(
    id: PlatformIdentifier,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    assertGitHub(id);
    try {
      const { data } = await withRetry(() =>
        this.octokit.repos.getContent({
          owner: id.owner,
          repo: id.repo,
          path: filePath,
          ref,
        }),
      );
      if ("content" in data && typeof data.content === "string") {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return null;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async postInlineComment(
    id: PlatformIdentifier,
    ctx: CommentPositionContext,
    file: string,
    line: number,
    body: string,
  ): Promise<void> {
    assertGitHub(id);
    if (ctx.platform !== "github") {
      throw new Error("Expected github context");
    }
    await this.octokit.pulls.createReviewComment({
      owner: id.owner,
      repo: id.repo,
      pull_number: id.pullNumber,
      commit_id: ctx.commitSha,
      path: file,
      line,
      side: "RIGHT",
      body,
    });
  }

  async postSummaryComment(id: PlatformIdentifier, body: string): Promise<void> {
    assertGitHub(id);
    await this.octokit.issues.createComment({
      owner: id.owner,
      repo: id.repo,
      issue_number: id.pullNumber,
      body,
    });
  }

  async checkConnection(signal?: AbortSignal): Promise<void> {
    await withRetry(() => this.octokit.users.getAuthenticated({ request: { signal } }));
  }
}
