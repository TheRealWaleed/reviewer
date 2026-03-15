import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeConfig, makeReviewResponse } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig();
vi.mock("../config.js", () => ({ config: mockConfig }));

const mockCreate = vi.fn();
const mockCountTokens = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate, countTokens: mockCountTokens };
  },
}));

const { getReview, checkClaudeConnection, ClaudeParseError, ClaudeSchemaError } =
  await import("./claude.client.js");

beforeEach(() => {
  mockCreate.mockReset();
  mockCountTokens.mockReset();
});

describe("getReview", () => {
  it("parses valid JSON response and returns ReviewResponse", async () => {
    const review = makeReviewResponse();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(review) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const result = await getReview("system", "user");
    expect(result).toEqual(review);
  });

  it("strips markdown code fences before parsing", async () => {
    const review = makeReviewResponse();
    const wrapped = "```json\n" + JSON.stringify(review) + "\n```";
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: wrapped }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const result = await getReview("system", "user");
    expect(result).toEqual(review);
  });

  it("calls onUsage callback with token counts", async () => {
    const review = makeReviewResponse();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(review) }],
      usage: { input_tokens: 200, output_tokens: 75 },
    });
    const onUsage = vi.fn();
    await getReview("system", "user", { onUsage });
    expect(onUsage).toHaveBeenCalledWith(200, 75);
  });

  it("throws on non-JSON response text", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "This is not JSON" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    await expect(getReview("system", "user")).rejects.toThrow(ClaudeParseError);
  });

  it("throws on JSON that doesn't match ReviewResponseSchema", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({ wrong: "shape" }) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    await expect(getReview("system", "user")).rejects.toThrow(ClaudeSchemaError);
  });
});

describe("checkClaudeConnection", () => {
  it("calls countTokens with signal", async () => {
    mockCountTokens.mockResolvedValueOnce({});
    const controller = new AbortController();
    await checkClaudeConnection(controller.signal);
    expect(mockCountTokens).toHaveBeenCalledOnce();
    const [, opts] = mockCountTokens.mock.calls[0];
    expect(opts.signal).toBe(controller.signal);
  });
});
