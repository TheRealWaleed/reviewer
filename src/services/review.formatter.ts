import type { InlineComment, ReviewResponse } from "../types/review.types.js";

const severityIcons: Record<string, string> = {
  critical: ":rotating_light:",
  major: ":warning:",
  minor: ":information_source:",
  suggestion: ":bulb:",
};

const approvalIcons: Record<string, string> = {
  approve: ":white_check_mark:",
  request_changes: ":x:",
  comment: ":speech_balloon:",
};

export function formatInlineComment(comment: InlineComment): string {
  const icon = severityIcons[comment.severity] ?? "";
  return `${icon} **[${comment.severity.toUpperCase()}]** ${comment.comment}`;
}

export function formatSummaryNote(
  summaries: string[],
  comments: InlineComment[],
  approval: ReviewResponse["approval"],
): string {
  const critical = comments.filter((c) => c.severity === "critical").length;
  const major = comments.filter((c) => c.severity === "major").length;
  const minor = comments.filter((c) => c.severity === "minor").length;
  const suggestions = comments.filter((c) => c.severity === "suggestion").length;

  const icon = approvalIcons[approval] ?? "";
  const summary = summaries.join("\n\n");

  const lines: string[] = [
    `## ${icon} AI Code Review`,
    "",
    `**Verdict:** ${approval.replace("_", " ")}`,
    "",
    summary,
    "",
  ];

  if (comments.length > 0) {
    lines.push("### Summary of Findings", "| Severity | Count |", "|---|---|");
    if (critical > 0) lines.push(`| :rotating_light: Critical | ${critical} |`);
    if (major > 0) lines.push(`| :warning: Major | ${major} |`);
    if (minor > 0) lines.push(`| :information_source: Minor | ${minor} |`);
    if (suggestions > 0) lines.push(`| :bulb: Suggestion | ${suggestions} |`);
  }

  lines.push("", "---", "*Automated review by AI Code Reviewer*");
  return lines.join("\n");
}
