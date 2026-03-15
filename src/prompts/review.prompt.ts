import type { FileDiff } from "../types/platform.types.js";

export function buildReviewPrompt(changes: FileDiff[]): string {
  const diffSections = changes
    .filter((c) => !c.isDeleted && c.diff)
    .map((change) => {
      const header = change.isRenamed
        ? `--- ${change.oldPath}\n+++ ${change.newPath} (renamed)`
        : change.isNewFile
          ? `+++ ${change.newPath} (new file)`
          : `--- ${change.oldPath}\n+++ ${change.newPath}`;

      return `### File: ${change.newPath}\n${header}\n\n${change.diff}`;
    });

  return `Review the following merge request diff. Analyze every changed file and provide your review as JSON.

${diffSections.join("\n\n---\n\n")}`;
}

const MAX_CHARS_PER_BATCH = 150_000;

export function chunkChanges(changes: FileDiff[]): FileDiff[][] {
  const chunks: FileDiff[][] = [];
  let current: FileDiff[] = [];
  let currentSize = 0;

  for (const change of changes) {
    const diffSize = change.diff?.length ?? 0;

    // If a single file exceeds the limit, put it in its own batch
    if (diffSize > MAX_CHARS_PER_BATCH) {
      if (current.length > 0) {
        chunks.push(current);
        current = [];
        currentSize = 0;
      }
      chunks.push([change]);
      continue;
    }

    if (currentSize + diffSize > MAX_CHARS_PER_BATCH && current.length > 0) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(change);
    currentSize += diffSize;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
