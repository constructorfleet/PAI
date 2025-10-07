import { stderr } from "node:process";
import stripAnsi from "strip-ansi";
import type { LogLevel } from "./types";

const LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

let currentLevel: LogLevel = (process.env.OPENAI_LOG_LEVEL as LogLevel) || "info";

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel) {
  return LEVELS[level] <= LEVELS[currentLevel] && currentLevel !== "silent";
}

function format(level: LogLevel, message: string) {
  const time = new Date().toISOString();
  const tag = level.toUpperCase().padEnd(5);
  return `[${time}] [${tag}] ${stripAnsi(message)}`;
}

export function log(level: LogLevel, message: string) {
  if (!shouldLog(level)) return;
  stderr.write(format(level, message) + "\n");
}

export function logError(err: unknown) {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  log("error", message);
}
