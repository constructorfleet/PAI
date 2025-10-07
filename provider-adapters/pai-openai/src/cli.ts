#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { promises as fs } from "node:fs";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { buildContext } from "./context";
import { callOpenAI } from "./adapter";
import { runHook } from "./hooks";
import { log, logError, setLogLevel } from "./log";
import { LogLevel } from "./types";

async function readStdin(): Promise<string> {
  if (stdin.isTTY) return "";
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });
  const chunks: string[] = [];
  for await (const line of rl) {
    chunks.push(line);
  }
  return chunks.join("\n");
}

async function readPromptFile(file?: string): Promise<string> {
  if (!file) return "";
  const content = await fs.readFile(file, "utf8");
  return content.trimEnd();
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("pai-openai")
    .usage("$0 [prompt | --file prompt.txt]")
    .option("file", {
      alias: "f",
      type: "string",
      describe: "Prompt file path"
    })
    .option("context", {
      type: "array",
      describe: "File paths or globs to attach as context"
    })
    .option("stdin", {
      type: "boolean",
      describe: "Treat STDIN as additional context"
    })
    .option("model", {
      type: "string",
      describe: "Model to use",
      default: process.env.OPENAI_MODEL || "gpt-4.1"
    })
    .option("json", {
      type: "boolean",
      describe: "Force JSON-mode output",
      default: process.env.OPENAI_JSON_MODE !== "false"
    })
    .option("stream", {
      type: "boolean",
      describe: "Stream tokens to stdout",
      default: true
    })
    .option("tool-spec", {
      type: "string",
      describe: "Path to JSON schema describing function tools"
    })
    .option("tool-exec", {
      type: "string",
      describe: "Executable to resolve tool calls"
    })
    .option("pre", {
      type: "string",
      describe: "Command to run before request"
    })
    .option("post", {
      type: "string",
      describe: "Command to run after request"
    })
    .option("out", {
      type: "string",
      describe: "Write final output to a file"
    })
    .option("timeout", {
      type: "number",
      describe: "Request timeout in milliseconds",
      default: Number(process.env.OPENAI_TIMEOUT_MS || 180_000)
    })
    .option("log-level", {
      choices: ["silent", "error", "warn", "info", "debug"] as const,
      describe: "Override log level"
    })
    .option("quiet", {
      type: "boolean",
      describe: "Silence logs"
    })
    .option("debug", {
      type: "boolean",
      describe: "Enable debug logging"
    })
    .option("max-context-bytes", {
      type: "number",
      describe: "Max bytes for combined context"
    })
    .option("max-file-bytes", {
      type: "number",
      describe: "Max bytes per context file"
    })
    .help()
    .example("pai-openai 'Summarize repo risks' --context 'src/**/*.ts' README.md --stream", "Stream summary")
    .example(
      "git diff | pai-openai --stdin 'Write tests for changed files' --json",
      "Attach STDIN diff with JSON output"
    )
    .example(
      "pai-openai -f prompts/refactor.md --tool-spec tools/whoami.json --post 'scripts/create-pr.sh'",
      "Run with tool spec and post hook"
    )
    .parseAsync();

  const logLevel = argv.quiet
    ? "silent"
    : (argv.logLevel as LogLevel) || (argv.debug ? "debug" : (process.env.OPENAI_LOG_LEVEL as LogLevel) || "info");
  setLogLevel(logLevel);

  const runId = Date.now().toString(36);

  const promptArg = argv._[0] ? String(argv._[0]) : "";
  const filePrompt = await readPromptFile(argv.file as string | undefined);
  const stdinPrompt = argv.stdin ? await readStdin() : "";

  const prompt = promptArg || filePrompt || stdinPrompt;

  if (!prompt) {
    throw new Error("No prompt provided. Pass an argument, -f file, or supply --stdin.");
  }

  const useStdinAsContext = Boolean(argv.stdin && (promptArg || filePrompt));

  const contextInput = await buildContext({
    globs: (argv.context as string[] | undefined) || [],
    stdinText: useStdinAsContext ? stdinPrompt : undefined,
    maxTotalBytes: argv.maxContextBytes as number | undefined,
    maxFileBytes: argv.maxFileBytes as number | undefined
  });

  if (argv.pre) {
    await runHook(argv.pre, {
      PROMPT: prompt,
      MODEL: argv.model as string,
      RUN_ID: runId,
      CONTEXT_PATHS: contextInput.entries.map(e => e.path).join(",")
    });
  }

  let callResult: Awaited<ReturnType<typeof callOpenAI>>;
  try {
    callResult = await callOpenAI({
      prompt,
      context: contextInput.text,
      model: argv.model as string,
      jsonMode: Boolean(argv.json),
      stream: Boolean(argv.stream),
      timeoutMs: Number(argv.timeout),
      toolSpecPath: argv["tool-spec"] as string | undefined,
      toolExec: argv["tool-exec"] as string | undefined
    });
  } catch (err) {
    logError(err);
    process.exit(1);
    return;
  }

  if (argv.out && callResult.text) {
    await fs.writeFile(argv.out as string, callResult.text, "utf8");
    log("info", `Wrote output to ${argv.out}`);
  }

  if (argv.post) {
    await runHook(argv.post, {
      PROMPT: prompt,
      MODEL: argv.model as string,
      RUN_ID: runId,
      OUTPUT_FILE: argv.out ? (argv.out as string) : "",
      OUTPUT_TEXT: callResult.text,
      TOOL_NAME: callResult.tool?.name,
      TOOL_ARGS: callResult.tool?.arguments,
      EXIT_CODE: String(callResult.exitCode)
    });
  }

  if (callResult.needsTool) {
    stdout.write("\n");
    stdout.write(JSON.stringify(callResult.tool, null, 2) + "\n");
  }

  process.exit(callResult.exitCode);
}

main().catch(err => {
  logError(err);
  process.exit(1);
});
