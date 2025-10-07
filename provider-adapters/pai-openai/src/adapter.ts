import OpenAI from "openai";
import { log, logError } from "./log";
import type { CallResult, ToolCall } from "./types";
import { executeTool, loadToolSpecs } from "./tools";

export type CallArgs = {
  prompt: string;
  context: string;
  model: string;
  jsonMode: boolean;
  stream: boolean;
  timeoutMs: number;
  toolSpecPath?: string;
  toolExec?: string;
};

export async function callOpenAI(args: CallArgs): Promise<CallResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    timeout: args.timeoutMs
  });

  const tools = await loadToolSpecs(args.toolSpecPath);

  const baseInput = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: args.prompt },
        ...(args.context ? [{ type: "text" as const, text: args.context }] : [])
      ]
    }
  ];

  if (args.stream) {
    return await handleStream(client, baseInput, tools, args);
  }

  return await handleNonStream(client, baseInput, tools, args);
}

async function handleStream(
  client: OpenAI,
  input: OpenAI.ResponseCreateParams["input"],
  tools: OpenAI.ResponseCreateParams["tools"],
  args: CallArgs
): Promise<CallResult> {
  const stream = await client.responses.stream({
    model: args.model,
    input,
    tools,
    response_format: args.jsonMode ? { type: "json_object" } : undefined
  });

  let buffer = "";
  let pendingTool: ToolCall | undefined;

  stream.on("event", event => {
    if (event.type === "response.output_text.delta" && event.delta) {
      buffer += event.delta;
      process.stdout.write(event.delta);
    }
    if (event.type === "response.tool_calls.created") {
      const call = event.tool_calls?.[0];
      if (call?.function) {
        pendingTool = {
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments
        };
        log("info", `Tool requested: ${pendingTool.name}`);
      }
    }
  });

  stream.on("error", err => {
    logError(err);
  });

  const finalMessage = await stream.finalMessage();

  if (pendingTool) {
    if (args.toolExec) {
      const toolOutput = await executeTool(args.toolExec, pendingTool);
      await stream.submitToolOutputs([
        {
          tool_call_id: pendingTool.id,
          output: toolOutput.output
        }
      ]);
      const followUp = await stream.finalResponse();
      const finalText = followUp.output_text ?? buffer;
      process.stdout.write("\n");
      return { exitCode: 0, text: finalText, needsTool: false };
    }
    log("warn", `Tool call required (${pendingTool.name}). Rerun with --tool-exec to satisfy.`);
    return { exitCode: 10, text: buffer, needsTool: true, tool: pendingTool };
  }

  const finalText = finalMessage?.output_text ?? buffer;
  return { exitCode: 0, text: finalText, needsTool: false };
}

async function handleNonStream(
  client: OpenAI,
  input: OpenAI.ResponseCreateParams["input"],
  tools: OpenAI.ResponseCreateParams["tools"],
  args: CallArgs
): Promise<CallResult> {
  const response = await client.responses.create({
    model: args.model,
    input,
    tools,
    response_format: args.jsonMode ? { type: "json_object" } : undefined
  });

  const outputText = response.output_text ?? "";
  const toolCalls = response.tool_calls ?? [];

  if (toolCalls.length) {
    const first = toolCalls[0];
    const pendingTool: ToolCall = {
      id: first.id,
      name: first.function.name,
      arguments: first.function.arguments
    };
    if (args.toolExec) {
      const toolOutput = await executeTool(args.toolExec, pendingTool);
      const followUp = await client.responses.submitToolOutputs(response.id, {
        tool_outputs: [
          {
            tool_call_id: pendingTool.id,
            output: toolOutput.output
          }
        ]
      });
      const final = followUp.output_text ?? "";
      process.stdout.write(final);
      return { exitCode: 0, text: final, needsTool: false };
    }
    log("warn", `Tool call required (${pendingTool.name}).`);
    return { exitCode: 10, text: outputText, needsTool: true, tool: pendingTool };
  }

  process.stdout.write(outputText);
  return { exitCode: 0, text: outputText, needsTool: false };
}
