import fg from "fast-glob";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ContextBuildOptions, ContextEntry } from "./types";
import { log } from "./log";

const DEFAULT_MAX_TOTAL = 900_000;
const DEFAULT_MAX_FILE = 512 * 1024;
const DEFAULT_EXTS = [
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rb",
  ".go",
  ".java"
];

export async function buildContext(options: ContextBuildOptions): Promise<{ entries: ContextEntry[]; text: string }> {
  const maxTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL;
  const maxFile = options.maxFileBytes ?? DEFAULT_MAX_FILE;
  const includeExtensions = options.includeExtensions ?? DEFAULT_EXTS;
  const globs = options.globs.length ? options.globs : [];

  const files = globs.length
    ? await fg(globs, {
        dot: false,
        unique: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/dist/**"],
        onlyFiles: true
      })
    : [];

  const entries: ContextEntry[] = [];
  let totalBytes = 0;

  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) continue;
      if (stat.size === 0) continue;
      const ext = path.extname(file).toLowerCase();
      if (!includeExtensions.includes(ext)) continue;
      if (stat.size > maxFile) {
        log("warn", `Skipping ${file} (>${Math.round(maxFile / 1024)}KB)`);
        continue;
      }
      if (totalBytes + stat.size > maxTotal) {
        log("warn", `Context budget reached; skipping remaining files (last attempted ${file}).`);
        break;
      }
      const raw = await fs.readFile(file, "utf8");
      const truncated = Buffer.byteLength(raw, "utf8") > maxFile;
      const text = truncated ? raw.slice(0, maxFile) : raw;
      totalBytes += Buffer.byteLength(text, "utf8");
      entries.push({ path: file, size: stat.size, text, truncated });
    } catch (err) {
      log("warn", `Failed to read context file ${file}: ${(err as Error).message}`);
    }
  }

  if (options.stdinText) {
    const stdin = options.stdinText.trimEnd();
    const chunk = stdin.slice(0, maxFile);
    const chunkBytes = Buffer.byteLength(chunk, "utf8");
    totalBytes += chunkBytes;
    entries.push({ path: "STDIN", size: Buffer.byteLength(stdin, "utf8"), text: chunk, truncated: chunk.length < stdin.length });
  }

  const header = `Context summary (${entries.length} sources, ${(totalBytes / 1024).toFixed(1)}KB)\n`;
  const combined =
    header +
    entries
      .map(entry => {
        const info = `${entry.path} (${Math.round(entry.size / 1024)}KB${entry.truncated ? ", truncated" : ""})`;
        return `\n===== ${info} =====\n${entry.text}`;
      })
      .join("\n");

  return { entries, text: combined.slice(0, maxTotal) };
}
