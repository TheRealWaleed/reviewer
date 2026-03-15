import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeConfig } from "../test-helpers/fixtures.js";

const mockConfig = makeConfig({ gitlabUrl: "https://gitlab.test" });

vi.mock("../config.js", () => ({ config: mockConfig }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const {
  getMRChanges,
  getMRVersions,
  getFileContent,
  postInlineComment,
  postMRNote,
  checkGitLabConnection,
  GitLabApiError,
} = await import("./gitlab.client.js");

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, body = "error") {
  return new Response(body, { status, ok: false });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getMRChanges", () => {
  it("returns parsed response on success", async () => {
    const data = {
      id: 1,
      iid: 10,
      title: "MR",
      description: "desc",
      source_branch: "feat",
      target_branch: "main",
      changes: [
        {
          old_path: "a.ts",
          new_path: "a.ts",
          a_mode: "100644",
          b_mode: "100644",
          new_file: false,
          renamed_file: false,
          deleted_file: false,
          diff: "+line\n",
        },
      ],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(data));
    const result = await getMRChanges(42, 10);
    expect(result.iid).toBe(10);
    expect(result.changes).toHaveLength(1);
  });

  it("throws GitLabApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, "Forbidden"));
    await expect(getMRChanges(42, 10)).rejects.toThrow(GitLabApiError);
  });
});

describe("getMRVersions", () => {
  it("returns parsed array of versions", async () => {
    const data = [
      { id: 1, head_commit_sha: "abc", base_commit_sha: "def", start_commit_sha: "ghi" },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse(data));
    const result = await getMRVersions(42, 10);
    expect(result).toHaveLength(1);
    expect(result[0].head_commit_sha).toBe("abc");
  });
});

describe("getFileContent", () => {
  it("decodes base64 content and returns string", async () => {
    const encoded = Buffer.from("hello world").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ content: encoded }));
    const result = await getFileContent(42, "src/app.ts", "main");
    expect(result).toBe("hello world");
  });

  it("returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, "Not Found"));
    const result = await getFileContent(42, "missing.ts", "main");
    expect(result).toBeNull();
  });

  it("rethrows non-404 errors", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, "Server Error"));
    await expect(getFileContent(42, "src/app.ts", "main")).rejects.toThrow(GitLabApiError);
  });
});

describe("postInlineComment", () => {
  it("sends POST with correct body and position", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const position = {
      base_sha: "a",
      start_sha: "b",
      head_sha: "c",
      position_type: "text" as const,
      old_path: "f.ts",
      new_path: "f.ts",
      new_line: 5,
    };
    await postInlineComment(42, 10, position, "comment body");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/projects/42/merge_requests/10/discussions");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.body).toBe("comment body");
    expect(body.position).toEqual(position);
  });

  it("throws GitLabApiError on failure", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(422, "Unprocessable"));
    const position = {
      base_sha: "a",
      start_sha: "b",
      head_sha: "c",
      position_type: "text" as const,
      old_path: "f.ts",
      new_path: "f.ts",
      new_line: 5,
    };
    await expect(postInlineComment(42, 10, position, "body")).rejects.toThrow(GitLabApiError);
  });
});

describe("postMRNote", () => {
  it("sends POST with correct body", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 201 }));
    await postMRNote(42, 10, "review note");
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/projects/42/merge_requests/10/notes");
    expect(JSON.parse(opts.body as string)).toEqual({ body: "review note" });
  });
});

describe("checkGitLabConnection", () => {
  it("resolves on 200", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(checkGitLabConnection()).resolves.toBeUndefined();
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, "Unauthorized"));
    await expect(checkGitLabConnection()).rejects.toThrow(GitLabApiError);
  });

  it("passes abort signal to fetch", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const controller = new AbortController();
    await checkGitLabConnection(controller.signal);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.signal).toBe(controller.signal);
  });
});
