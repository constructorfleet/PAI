import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeTool, loadToolSpecs } from "../src/tools";

const nodeBinary = process.execPath;

describe("loadToolSpecs", () => {
  it("reads a tool schema file and normalizes to OpenAI format", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "pai-openai-tools-"));
    const file = path.join(dir, "spec.json");
    await fs.writeFile(
      file,
      JSON.stringify({ name: "whoami", description: "Describe user", parameters: { type: "object" } }),
      "utf8"
    );

    const specs = await loadToolSpecs(file);
    expect(specs).toEqual([
      {
        type: "function",
        function: {
          name: "whoami",
          description: "Describe user",
          parameters: { type: "object" }
        }
      }
    ]);
  });
});

describe("executeTool", () => {
  it("streams tool args to the executor and returns JSON metadata", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "pai-openai-tool-exec-"));
    const script = path.join(dir, "tool.js");
    await fs.writeFile(
      script,
      [
        "let input = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', chunk => input += chunk);",
        "process.stdin.on('end', () => {",
        "  if (process.env.TOOL_NAME !== 'whoami') process.exit(2);",
        "  const payload = { input: input.trim(), id: process.env.TOOL_CALL_ID };",
        "  process.stdout.write(JSON.stringify(payload));",
        "  process.exit(0);",
        "});"
      ].join("\n"),
      "utf8"
    );

    const result = await executeTool(`${nodeBinary} ${script}`, {
      id: "call-123",
      name: "whoami",
      arguments: '{"hello":"world"}'
    });

    expect(result.isJson).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ input: '{"hello":"world"}', id: "call-123" });
  });
});
