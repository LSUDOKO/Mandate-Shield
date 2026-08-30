import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The golden rule, enforced as a test rather than a convention.
 *
 * The LLM is allowed to understand what the user wants and to search the
 * catalog. It is never allowed near money logic, signature checks, or spend
 * limits. If one of these fails, the violation is real: fix the source, never
 * relax the assertion.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("architecture: the money path contains no AI", () => {
  it("finds core source files to inspect", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("imports no AI SDK anywhere in core", () => {
    const banned = [
      /from\s+["']groq-sdk["']/,
      /from\s+["']openai["']/,
      /from\s+["']@anthropic-ai\//,
      /from\s+["']@google\/generative-ai["']/,
      /from\s+["']cohere-ai["']/,
    ];

    for (const file of files) {
      for (const pattern of banned) {
        expect(pattern.test(file.text), `${file.path} imports an AI SDK`).toBe(false);
      }
    }
  });

  it("does not depend on the agent package", () => {
    for (const file of files) {
      expect(/@mandate-shield\/agent/.test(file.text), `${file.path} depends on the agent`).toBe(false);
    }
  });

  it("declares no runtime dependencies at all in its manifest", () => {
    const manifest = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it("makes no network calls from the check path", () => {
    for (const file of files) {
      expect(/\bfetch\s*\(/.test(file.text), `${file.path} calls fetch`).toBe(false);
      expect(/from\s+["']node:(https?|net)["']/.test(file.text), `${file.path} imports a network module`).toBe(false);
    }
  });

  it("reads neither the clock nor the random generator inside checks", () => {
    const checkFiles = files.filter((f) => f.path.includes("checks") || f.path.endsWith("verifier.ts"));
    expect(checkFiles.length).toBeGreaterThan(4);

    for (const file of checkFiles) {
      expect(/Date\.now\s*\(/.test(file.text), `${file.path} reads the clock`).toBe(false);
      expect(/Math\.random\s*\(/.test(file.text), `${file.path} uses randomness`).toBe(false);
      expect(/new\s+Date\s*\(\s*\)/.test(file.text), `${file.path} constructs a current date`).toBe(false);
    }
  });
});
