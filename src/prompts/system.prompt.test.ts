import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./system.prompt.js";

describe("buildSystemPrompt", () => {
  it("includes languages in tech description", () => {
    const result = buildSystemPrompt({ languages: ["TypeScript"], frameworks: [], buildTools: [] });
    expect(result).toContain("Languages: TypeScript");
  });

  it("includes frameworks in tech description", () => {
    const result = buildSystemPrompt({
      languages: [],
      frameworks: ["React", "Next.js"],
      buildTools: [],
    });
    expect(result).toContain("Frameworks: React, Next.js");
  });

  it("includes build tools in tech description", () => {
    const result = buildSystemPrompt({ languages: [], frameworks: [], buildTools: ["Vite"] });
    expect(result).toContain("Build tools: Vite");
  });

  it("includes all three when present", () => {
    const result = buildSystemPrompt({
      languages: ["TypeScript"],
      frameworks: ["React"],
      buildTools: ["Vite"],
    });
    expect(result).toContain("Languages: TypeScript");
    expect(result).toContain("Frameworks: React");
    expect(result).toContain("Build tools: Vite");
  });

  it("omits tech description when all arrays empty", () => {
    const result = buildSystemPrompt({ languages: [], frameworks: [], buildTools: [] });
    expect(result).not.toContain("You are reviewing code in a project using:");
  });

  it("always includes review guidelines and JSON format instructions", () => {
    const result = buildSystemPrompt({ languages: [], frameworks: [], buildTools: [] });
    expect(result).toContain("expert code reviewer");
    expect(result).toContain("Severity Levels");
    expect(result).toContain("Response Format");
    expect(result).toContain('"summary"');
    expect(result).toContain('"comments"');
    expect(result).toContain('"approval"');
  });
});
