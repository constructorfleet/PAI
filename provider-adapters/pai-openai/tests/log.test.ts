/// <reference types="vitest" />

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { log, logError, setLogLevel } from "../src/log";

describe("log", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("debug");
  });

  afterEach(() => {
    spy.mockRestore();
    setLogLevel("info");
  });

  it("writes messages at or above the current level", () => {
    log("info", "message");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[INFO ]"));
  });

  it("suppresses messages below the current level", () => {
    setLogLevel("error");
    log("warn", "should not appear");
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs error stacks via logError", () => {
    const error = new Error("boom");
    logError(error);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
