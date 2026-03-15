import { describe, it, expect } from "vitest";
import { formatInlineComment, formatSummaryNote } from "./review.formatter.js";
import type { InlineComment } from "../types/review.types.js";

describe("formatInlineComment", () => {
  it("prepends rotating_light icon for critical severity", () => {
    const comment: InlineComment = {
      file: "a.ts",
      line: 1,
      severity: "critical",
      comment: "Bug here",
    };
    const result = formatInlineComment(comment);
    expect(result).toContain(":rotating_light:");
    expect(result).toContain("**[CRITICAL]**");
    expect(result).toContain("Bug here");
  });

  it("prepends warning icon for major severity", () => {
    const comment: InlineComment = {
      file: "a.ts",
      line: 1,
      severity: "major",
      comment: "Design issue",
    };
    const result = formatInlineComment(comment);
    expect(result).toContain(":warning:");
    expect(result).toContain("**[MAJOR]**");
  });

  it("prepends information_source icon for minor severity", () => {
    const comment: InlineComment = {
      file: "a.ts",
      line: 1,
      severity: "minor",
      comment: "Style nit",
    };
    const result = formatInlineComment(comment);
    expect(result).toContain(":information_source:");
    expect(result).toContain("**[MINOR]**");
  });

  it("prepends bulb icon for suggestion severity", () => {
    const comment: InlineComment = {
      file: "a.ts",
      line: 1,
      severity: "suggestion",
      comment: "Consider this",
    };
    const result = formatInlineComment(comment);
    expect(result).toContain(":bulb:");
    expect(result).toContain("**[SUGGESTION]**");
  });
});

describe("formatSummaryNote", () => {
  it("includes verdict with correct approval icon", () => {
    const result = formatSummaryNote(["Looks good"], [], "approve");
    expect(result).toContain(":white_check_mark:");
    expect(result).toContain("**Verdict:** approve");
  });

  it("shows request_changes icon and verdict", () => {
    const result = formatSummaryNote(["Issues found"], [], "request_changes");
    expect(result).toContain(":x:");
    expect(result).toContain("**Verdict:** request changes");
  });

  it("joins multiple summaries with double newline", () => {
    const result = formatSummaryNote(["Summary A", "Summary B"], [], "approve");
    expect(result).toContain("Summary A\n\nSummary B");
  });

  it("shows findings table with correct counts per severity", () => {
    const comments: InlineComment[] = [
      { file: "a.ts", line: 1, severity: "critical", comment: "c1" },
      { file: "a.ts", line: 2, severity: "critical", comment: "c2" },
      { file: "b.ts", line: 1, severity: "major", comment: "m1" },
      { file: "c.ts", line: 1, severity: "minor", comment: "n1" },
      { file: "d.ts", line: 1, severity: "suggestion", comment: "s1" },
    ];
    const result = formatSummaryNote(["Summary"], comments, "request_changes");
    expect(result).toContain("Critical | 2");
    expect(result).toContain("Major | 1");
    expect(result).toContain("Minor | 1");
    expect(result).toContain("Suggestion | 1");
  });

  it("omits findings table when no comments", () => {
    const result = formatSummaryNote(["All good"], [], "approve");
    expect(result).not.toContain("Summary of Findings");
  });

  it("includes automated review footer", () => {
    const result = formatSummaryNote(["Summary"], [], "approve");
    expect(result).toContain("Automated review by AI Code Reviewer");
  });
});
