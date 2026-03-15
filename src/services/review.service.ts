import type { FastifyBaseLogger } from "fastify";
import type { ReviewResponse, InlineComment } from "../types/review.types.js";
import type {
  PlatformClient,
  ReviewRequest,
  FileDiff,
  CommentPositionContext,
} from "../types/platform.types.js";
import { detectTechStack } from "./tech-detector.service.js";
import { buildSystemPrompt } from "../prompts/system.prompt.js";
import { buildReviewPrompt, chunkChanges } from "../prompts/review.prompt.js";
import { getReview } from "../clients/claude.client.js";
import { recordUsage } from "./usage.service.js";
import { formatInlineComment, formatSummaryNote } from "./review.formatter.js";

const COMMENT_CONCURRENCY = 5;

export async function reviewMergeRequest(
  client: PlatformClient,
  req: ReviewRequest,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    await executeReview(client, req, log);
  } catch (err) {
    log.error(err, "Review failed");
    await client
      .postSummaryComment(
        req.identifier,
        ":warning: **AI Code Review Failed**\n\nThe automated review encountered an error. Please check the service logs.",
      )
      .catch((noteErr) => {
        log.error(noteErr, "Failed to post review failure note");
      });
  }
}

async function executeReview(
  client: PlatformClient,
  req: ReviewRequest,
  log: FastifyBaseLogger,
): Promise<void> {
  let { targetBranch } = req;
  const { identifier } = req;

  // 0. Resolve branches if not provided (e.g., triggered via issue_comment)
  if (!targetBranch || !req.sourceBranch) {
    log.info("Branch info missing, fetching from platform");
    const branchInfo = await client.getBranchInfo(identifier);
    if (!targetBranch) targetBranch = branchInfo.targetBranch;
  }

  // 1. Fetch changes
  log.info("Fetching changes");
  const changes = await client.getChanges(identifier);

  if (changes.length === 0) {
    log.info("No changes found, skipping review");
    return;
  }

  // 2. Fetch comment position context
  log.info("Fetching comment position context");
  let positionCtx: CommentPositionContext;
  try {
    positionCtx = await client.getCommentPositionContext(identifier);
  } catch (err) {
    log.warn(err, "Could not get comment position context, cannot post inline comments");
    return;
  }

  // 3. Detect tech stack
  log.info("Detecting tech stack");
  const techContext = await detectTechStack(client, identifier, targetBranch, changes);
  log.info({ techContext }, "Tech stack detected");

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(techContext);

  // 5. Chunk changes if needed and get reviews
  const chunks = chunkChanges(changes);
  log.info({ chunks: chunks.length }, "Processing diff chunks");

  const allComments: InlineComment[] = [];
  const summaries: string[] = [];
  let finalApproval: ReviewResponse["approval"] = "approve";

  for (let i = 0; i < chunks.length; i++) {
    const hasReviewableContent = chunks[i].some((c) => !c.isDeleted && c.diff);
    if (!hasReviewableContent) {
      log.info({ chunk: i + 1, total: chunks.length }, "Chunk has no reviewable changes, skipping");
      continue;
    }

    log.info({ chunk: i + 1, total: chunks.length }, "Reviewing chunk");
    const userPrompt = buildReviewPrompt(chunks[i]);
    const review = await getReview(systemPrompt, userPrompt, { onUsage: recordUsage });

    allComments.push(...review.comments);
    summaries.push(review.summary);

    // Escalate approval: request_changes > comment > approve
    if (review.approval === "request_changes") {
      finalApproval = "request_changes";
    } else if (review.approval === "comment" && finalApproval !== "request_changes") {
      finalApproval = "comment";
    }
  }

  // 6. Build change metadata lookup for correct positioning
  const changeByPath = new Map<string, FileDiff>();
  for (const change of changes) {
    changeByPath.set(change.newPath, change);
  }

  // 7. Post inline comments with concurrency
  log.info({ count: allComments.length }, "Posting inline comments");
  for (let i = 0; i < allComments.length; i += COMMENT_CONCURRENCY) {
    const batch = allComments.slice(i, i + COMMENT_CONCURRENCY);
    await Promise.all(
      batch.map((comment) => {
        const change = changeByPath.get(comment.file);
        const oldPath = change?.oldPath ?? comment.file;
        const body = formatInlineComment(comment);
        return client
          .postInlineComment(identifier, positionCtx, comment.file, comment.line, body, oldPath)
          .catch((err) => {
            log.warn(
              { file: comment.file, line: comment.line, err },
              "Failed to post inline comment",
            );
          });
      }),
    );
  }

  // 8. Post summary comment
  const summaryNote = formatSummaryNote(summaries, allComments, finalApproval);
  log.info("Posting summary note");
  await client.postSummaryComment(identifier, summaryNote);

  log.info("Review complete");
}
