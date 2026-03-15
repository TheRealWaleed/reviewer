import { describe, it, expect } from "vitest";
import { buildReviewPrompt, chunkChanges } from "./review.prompt.js";
import { makeFileDiff } from "../test-helpers/fixtures.js";

describe("buildReviewPrompt", () => {
  it("formats a single changed file with diff header", () => {
    const changes = [makeFileDiff({ oldPath: "src/app.ts", newPath: "src/app.ts" })];
    const result = buildReviewPrompt(changes);
    expect(result).toContain("### File: src/app.ts");
    expect(result).toContain("--- src/app.ts");
    expect(result).toContain("+++ src/app.ts");
  });

  it("formats renamed file with old/new path header", () => {
    const changes = [
      makeFileDiff({
        oldPath: "src/old.ts",
        newPath: "src/new.ts",
        isRenamed: true,
        diff: "@@ -1 +1 @@\n-old\n+new\n",
      }),
    ];
    const result = buildReviewPrompt(changes);
    expect(result).toContain("--- src/old.ts");
    expect(result).toContain("+++ src/new.ts (renamed)");
  });

  it("formats new file with (new file) suffix", () => {
    const changes = [
      makeFileDiff({
        oldPath: "src/new.ts",
        newPath: "src/new.ts",
        isNewFile: true,
        diff: "@@ -0,0 +1 @@\n+console.log('hello');\n",
      }),
    ];
    const result = buildReviewPrompt(changes);
    expect(result).toContain("+++ src/new.ts (new file)");
    expect(result).not.toContain("--- src/new.ts");
  });

  it("skips deleted files", () => {
    const changes = [makeFileDiff({ isDeleted: true, diff: "@@ -1 +0,0 @@\n-removed\n" })];
    const result = buildReviewPrompt(changes);
    expect(result).not.toContain("### File:");
  });

  it("skips files with empty diff", () => {
    const changes = [makeFileDiff({ diff: "" })];
    const result = buildReviewPrompt(changes);
    expect(result).not.toContain("### File:");
  });

  it("joins multiple file diffs with --- separator", () => {
    const changes = [
      makeFileDiff({ newPath: "src/a.ts", oldPath: "src/a.ts", diff: "+line1\n" }),
      makeFileDiff({ newPath: "src/b.ts", oldPath: "src/b.ts", diff: "+line2\n" }),
    ];
    const result = buildReviewPrompt(changes);
    expect(result).toContain("### File: src/a.ts");
    expect(result).toContain("---\n\n### File: src/b.ts");
  });
});

describe("chunkChanges", () => {
  it("returns single chunk when total diff < 150k chars", () => {
    const changes = [
      makeFileDiff({ diff: "a".repeat(1000) }),
      makeFileDiff({ diff: "b".repeat(1000) }),
    ];
    const chunks = chunkChanges(changes);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it("splits into multiple chunks at 150k boundary", () => {
    const changes = [
      makeFileDiff({ diff: "a".repeat(80_000) }),
      makeFileDiff({ diff: "b".repeat(80_000) }),
    ];
    const chunks = chunkChanges(changes);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1);
    expect(chunks[1]).toHaveLength(1);
  });

  it("puts oversized single file in its own chunk", () => {
    const changes = [
      makeFileDiff({ diff: "a".repeat(200_000) }),
      makeFileDiff({ diff: "b".repeat(100) }),
    ];
    const chunks = chunkChanges(changes);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1);
    expect(chunks[1]).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(chunkChanges([])).toEqual([]);
  });

  it("keeps small files together in one chunk", () => {
    const changes = Array.from({ length: 10 }, () => makeFileDiff({ diff: "x".repeat(100) }));
    const chunks = chunkChanges(changes);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(10);
  });
});
