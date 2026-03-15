import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFileDiff } from "../test-helpers/fixtures.js";
import type { PlatformClient, PlatformIdentifier } from "../types/platform.types.js";

const mockGetFileContent = vi.fn();

const mockClient: PlatformClient = {
  getChanges: vi.fn(),
  getCommentPositionContext: vi.fn(),
  getFileContent: mockGetFileContent,
  postInlineComment: vi.fn(),
  postSummaryComment: vi.fn(),
  checkConnection: vi.fn(),
};

const gitlabId: PlatformIdentifier = { platform: "gitlab", projectId: 42, mrIid: 10 };

const { detectTechStack } = await import("./tech-detector.service.js");

beforeEach(() => {
  mockGetFileContent.mockReset();
  mockGetFileContent.mockResolvedValue(null);
});

describe("detectTechStack", () => {
  it("detects TypeScript from .ts extension", async () => {
    const changes = [makeFileDiff({ newPath: "src/app.ts" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.languages).toContain("TypeScript");
  });

  it("detects TypeScript from .tsx extension", async () => {
    const changes = [makeFileDiff({ newPath: "src/App.tsx" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.languages).toContain("TypeScript");
  });

  it("detects Python from .py extension", async () => {
    const changes = [makeFileDiff({ newPath: "app.py" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.languages).toContain("Python");
  });

  it("detects multiple languages from mixed changes", async () => {
    const changes = [
      makeFileDiff({ newPath: "src/app.ts" }),
      makeFileDiff({ newPath: "scripts/build.py" }),
      makeFileDiff({ newPath: "cmd/main.go" }),
    ];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.languages).toContain("TypeScript");
    expect(result.languages).toContain("Python");
    expect(result.languages).toContain("Go");
  });

  it("detects React from package.json dependencies", async () => {
    mockGetFileContent.mockImplementation(async (_id: PlatformIdentifier, file: string) => {
      if (file === "package.json") {
        return JSON.stringify({ dependencies: { react: "^18.0.0" }, devDependencies: {} });
      }
      return null;
    });
    const changes = [makeFileDiff({ newPath: "src/App.tsx" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.frameworks).toContain("React");
  });

  it("detects Next.js from package.json dependencies", async () => {
    mockGetFileContent.mockImplementation(async (_id: PlatformIdentifier, file: string) => {
      if (file === "package.json") {
        return JSON.stringify({
          dependencies: { next: "^14.0.0", react: "^18.0.0" },
          devDependencies: {},
        });
      }
      return null;
    });
    const changes = [makeFileDiff({ newPath: "src/page.tsx" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.frameworks).toContain("Next.js");
  });

  it("detects Vite as build tool", async () => {
    mockGetFileContent.mockImplementation(async (_id: PlatformIdentifier, file: string) => {
      if (file === "package.json") {
        return JSON.stringify({ dependencies: {}, devDependencies: { vite: "^5.0.0" } });
      }
      return null;
    });
    const changes = [makeFileDiff({ newPath: "src/main.ts" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.buildTools).toContain("Vite");
  });

  it("detects Spring Boot from pom.xml", async () => {
    mockGetFileContent.mockImplementation(async (_id: PlatformIdentifier, file: string) => {
      if (file === "pom.xml") {
        return "<project><dependencies><dependency>spring-boot-starter</dependency></dependencies></project>";
      }
      return null;
    });
    const changes = [makeFileDiff({ newPath: "src/main/java/App.java" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.frameworks).toContain("Spring Boot");
    expect(result.buildTools).toContain("Maven");
  });

  it("detects Django from requirements.txt", async () => {
    mockGetFileContent.mockImplementation(async (_id: PlatformIdentifier, file: string) => {
      if (file === "requirements.txt") return "django==4.2\ncelery==5.3\n";
      return null;
    });
    const changes = [makeFileDiff({ newPath: "app/views.py" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.frameworks).toContain("Django");
  });

  it("returns empty arrays when no config files found", async () => {
    const changes = [makeFileDiff({ newPath: "README.md" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.frameworks).toEqual([]);
    expect(result.buildTools).toEqual([]);
  });

  it("handles getFileContent returning null", async () => {
    mockGetFileContent.mockResolvedValue(null);
    const changes = [makeFileDiff({ newPath: "src/app.ts" })];
    const result = await detectTechStack(mockClient, gitlabId, "main", changes);
    expect(result.languages).toContain("TypeScript");
    expect(result.frameworks).toEqual([]);
  });
});
