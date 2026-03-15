import { z } from "zod";
import type { TechContext } from "../types/review.types.js";
import type { FileDiff, PlatformClient, PlatformIdentifier } from "../types/platform.types.js";

const PackageJsonSchema = z
  .object({
    dependencies: z.record(z.string(), z.string()).optional().default({}),
    devDependencies: z.record(z.string(), z.string()).optional().default({}),
  })
  .passthrough();

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".dart": "Dart",
  ".scala": "Scala",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C",
  ".hpp": "C++",
  ".vue": "Vue",
  ".svelte": "Svelte",
};

interface ConfigFileDetector {
  file: string;
  detect: (content: string) => { frameworks: string[]; buildTools: string[] };
}

const CONFIG_DETECTORS: ConfigFileDetector[] = [
  {
    file: "package.json",
    detect: (content) => {
      const frameworks: string[] = [];
      const buildTools: string[] = ["npm"];
      try {
        const pkg = PackageJsonSchema.parse(JSON.parse(content));
        const depNames = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)];

        const frameworkMap: Record<string, string> = {
          next: "Next.js",
          react: "React",
          vue: "Vue.js",
          "@angular/core": "Angular",
          svelte: "Svelte",
          express: "Express",
          fastify: "Fastify",
          nestjs: "NestJS",
          "@nestjs/core": "NestJS",
          nuxt: "Nuxt",
          gatsby: "Gatsby",
          remix: "Remix",
          hono: "Hono",
        };

        for (const dep of depNames) {
          if (frameworkMap[dep]) {
            frameworks.push(frameworkMap[dep]);
          }
        }

        if (depNames.includes("vite")) buildTools.push("Vite");
        if (depNames.includes("webpack")) buildTools.push("Webpack");
        if (depNames.includes("esbuild")) buildTools.push("esbuild");
        if (depNames.includes("tsup")) buildTools.push("tsup");
      } catch {
        // ignore parse errors
      }
      return { frameworks, buildTools };
    },
  },
  {
    file: "go.mod",
    detect: (content) => {
      const frameworks: string[] = [];
      if (content.includes("github.com/gin-gonic/gin")) frameworks.push("Gin");
      if (content.includes("github.com/gofiber/fiber")) frameworks.push("Fiber");
      if (content.includes("github.com/labstack/echo")) frameworks.push("Echo");
      return { frameworks, buildTools: ["Go modules"] };
    },
  },
  {
    file: "pom.xml",
    detect: (content) => {
      const frameworks: string[] = [];
      if (content.includes("spring-boot")) frameworks.push("Spring Boot");
      if (content.includes("quarkus")) frameworks.push("Quarkus");
      return { frameworks, buildTools: ["Maven"] };
    },
  },
  {
    file: "build.gradle",
    detect: (content) => {
      const frameworks: string[] = [];
      if (content.includes("spring-boot")) frameworks.push("Spring Boot");
      return { frameworks, buildTools: ["Gradle"] };
    },
  },
  {
    file: "requirements.txt",
    detect: (content) => {
      const frameworks: string[] = [];
      if (content.includes("django")) frameworks.push("Django");
      if (content.includes("flask")) frameworks.push("Flask");
      if (content.includes("fastapi")) frameworks.push("FastAPI");
      return { frameworks, buildTools: ["pip"] };
    },
  },
  {
    file: "pyproject.toml",
    detect: (content) => {
      const frameworks: string[] = [];
      if (content.includes("django")) frameworks.push("Django");
      if (content.includes("flask")) frameworks.push("Flask");
      if (content.includes("fastapi")) frameworks.push("FastAPI");
      const buildTools: string[] = [];
      if (content.includes("[tool.poetry]")) buildTools.push("Poetry");
      if (content.includes("[build-system]")) buildTools.push("pyproject");
      return { frameworks, buildTools };
    },
  },
  {
    file: "Cargo.toml",
    detect: (content) => {
      const frameworks: string[] = [];
      if (content.includes("actix-web")) frameworks.push("Actix Web");
      if (content.includes("axum")) frameworks.push("Axum");
      if (content.includes("rocket")) frameworks.push("Rocket");
      return { frameworks, buildTools: ["Cargo"] };
    },
  },
  {
    file: "Gemfile",
    detect: (content) => {
      const frameworks: string[] = [];
      if (content.includes("rails")) frameworks.push("Ruby on Rails");
      if (content.includes("sinatra")) frameworks.push("Sinatra");
      return { frameworks, buildTools: ["Bundler"] };
    },
  },
];

export async function detectTechStack(
  client: PlatformClient,
  id: PlatformIdentifier,
  branch: string,
  changes: FileDiff[],
): Promise<TechContext> {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const buildTools = new Set<string>();

  // Detect languages from changed file extensions
  for (const change of changes) {
    const path = change.newPath || change.oldPath;
    const ext = getExtension(path);
    if (ext && EXTENSION_MAP[ext]) {
      languages.add(EXTENSION_MAP[ext]);
    }
  }

  // Check config files in repo for frameworks/build tools
  const detections = await Promise.allSettled(
    CONFIG_DETECTORS.map(async (detector) => {
      const content = await client.getFileContent(id, detector.file, branch);
      if (content) {
        return detector.detect(content);
      }
      return null;
    }),
  );

  for (const result of detections) {
    if (result.status === "fulfilled" && result.value) {
      for (const fw of result.value.frameworks) frameworks.add(fw);
      for (const bt of result.value.buildTools) buildTools.add(bt);
    }
  }

  return {
    languages: [...languages],
    frameworks: [...frameworks],
    buildTools: [...buildTools],
  };
}

function getExtension(filePath: string): string | null {
  const match = filePath.match(/(\.[^.]+)$/);
  return match ? match[1] : null;
}
