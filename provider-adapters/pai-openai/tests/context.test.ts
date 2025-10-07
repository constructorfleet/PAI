/// <reference types="vitest" />

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext } from "../src/context";

async function setupFixture() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "pai-openai-context-"));
  const files = {
    "readme.md": "Hello world", // allowed
    "notes.txt": "Second file", // allowed
    "image.png": "binary?", // skipped by extension
    "big.ts": "export const data = \"" + "x".repeat(1024) + "\";"
  } as Record<string, string>;

  await Promise.all(
    Object.entries(files).map(async ([name, contents]) => {
      await fs.writeFile(path.join(dir, name), contents, "utf8");
    })
  );

  return dir;
}

describe("buildContext", () => {
  it("collects matching files and summarizes context", async () => {
    const dir = await setupFixture();
    const { entries, text } = await buildContext({
      globs: [path.join(dir, "**/*")],
      maxTotalBytes: 20_000,
      maxFileBytes: 2_048
    });

    expect(entries.map(e => e.path).sort()).toContain(path.join(dir, "notes.txt"));
    expect(entries.map(e => e.path).sort()).toContain(path.join(dir, "readme.md"));
    expect(entries.find(e => e.path.endsWith("image.png"))).toBeUndefined();
    expect(text).toMatch(/Context summary/);
    expect(text).toMatch(/===== .*readme\.md/);
  });

  it("appends STDIN content and respects file truncation", async () => {
    const dir = await setupFixture();
    const { entries } = await buildContext({
      globs: [path.join(dir, "**/*")],
      maxTotalBytes: 4_096,
      maxFileBytes: 128,
      stdinText: "streamed input"
    });

    const bigEntry = entries.find(e => e.path.endsWith("big.ts"));
    expect(bigEntry).toBeDefined();
    expect(bigEntry?.truncated).toBe(true);
    expect(bigEntry?.text.length).toBe(128);

    const stdinEntry = entries.find(e => e.path === "STDIN");
    expect(stdinEntry).toBeDefined();
    expect(stdinEntry?.text).toBe("streamed input");
  });
});
