export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export type ContextEntry = {
  path: string;
  size: number;
  text: string;
  truncated: boolean;
};

export type ContextBuildOptions = {
  globs: string[];
  stdinText?: string;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  includeExtensions?: string[];
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type CallResult = {
  exitCode: number;
  text: string;
  needsTool: boolean;
  tool?: ToolCall;
};

export type HookEnv = Record<string, string | undefined>;

export type ToolSpec = {
  name: string;
  description?: string;
  parameters?: unknown;
};

export type ToolSpecFile = ToolSpec | ToolSpec[];

export type ToolExecutionResult = {
  output: string;
  isJson: boolean;
};
