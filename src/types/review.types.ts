import { z } from "zod";

export const InlineCommentSchema = z.object({
  file: z.string(),
  line: z.number(),
  severity: z.enum(["critical", "major", "minor", "suggestion"]),
  comment: z.string(),
});

export const ReviewResponseSchema = z.object({
  summary: z.string(),
  comments: z.array(InlineCommentSchema),
  approval: z.enum(["approve", "request_changes", "comment"]),
});

export const TechContextSchema = z.object({
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  buildTools: z.array(z.string()),
});

export type InlineComment = z.infer<typeof InlineCommentSchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
export type TechContext = z.infer<typeof TechContextSchema>;
