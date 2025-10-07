import { promises as fs } from "node:fs";
import path from "node:path";
import { ToolExecutionResult, ToolSpecFile, ToolCall } from "./types";
import { log } from "./log";

export async function loadToolSpecs(toolSpecPath?: string) {
  if (!toolSpecPath) return undefined;
  const absolute = path.resolve(toolSpecPath);
  const raw = await fs.readFile(absolute, "utf8");
  const parsed = JSON.parse(raw) as ToolSpecFile;
  const specs = Array.isArray(parsed) ? parsed : [parsed];
  return specs.map(spec => ({
    type: "function" as const,
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters
    }
  }));
}

export async function executeTool(toolExec: string, call: ToolCall): Promise<ToolExecutionResult> {
  const { spawn } = await import("node:child_process");

  log("info", `Executing tool handler ${toolExec} for ${call.name}`);

  return new Promise((resolve, reject) => {
    const child = spawn(toolExec, {
      shell: true,
      stdio: ["pipe", "pipe", "inherit"],
      env: {
        ...process.env,
        TOOL_NAME: call.name,
        TOOL_ARGS: call.arguments,
        TOOL_CALL_ID: call.id
      }
    });
    let stdout = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) {
        reject(new Error(`Tool executor exited with ${code}`));
        return;
      }
      const trimmed = stdout.trim();
      const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");
      resolve({ output: trimmed, isJson });
    });
    child.stdin.write(call.arguments);
    child.stdin.end();
  });
}
