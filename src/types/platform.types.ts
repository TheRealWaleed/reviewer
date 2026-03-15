export interface FileDiff {
  oldPath: string;
  newPath: string;
  isNewFile: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
  diff: string;
}

export type PlatformIdentifier =
  | { platform: "gitlab"; projectId: number; mrIid: number }
  | { platform: "github"; owner: string; repo: string; pullNumber: number };

export type CommentPositionContext =
  | { platform: "gitlab"; baseSha: string; startSha: string; headSha: string }
  | { platform: "github"; commitSha: string };

export interface ReviewRequest {
  identifier: PlatformIdentifier;
  sourceBranch: string;
  targetBranch: string;
}

export interface PlatformClient {
  getChanges(id: PlatformIdentifier): Promise<FileDiff[]>;
  getCommentPositionContext(id: PlatformIdentifier): Promise<CommentPositionContext>;
  getFileContent(id: PlatformIdentifier, filePath: string, ref: string): Promise<string | null>;
  getBranchInfo(id: PlatformIdentifier): Promise<{ sourceBranch: string; targetBranch: string }>;
  postInlineComment(
    id: PlatformIdentifier,
    ctx: CommentPositionContext,
    file: string,
    line: number,
    body: string,
    oldPath?: string,
  ): Promise<void>;
  postSummaryComment(id: PlatformIdentifier, body: string): Promise<void>;
  checkConnection(signal?: AbortSignal): Promise<void>;
}
