import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadToolSpecsMock = vi.fn();
const executeToolMock = vi.fn();
const createMock = vi.fn();
const streamMock = vi.fn();
const submitToolOutputsMock = vi.fn();

vi.mock("../src/tools", () => ({
  loadToolSpecs: loadToolSpecsMock,
  executeTool: executeToolMock
}));

vi.mock("openai", () => ({
  __esModule: true,
  default: vi.fn(() => ({
    responses: {
      create: createMock,
      stream: streamMock,
      submitToolOutputs: submitToolOutputsMock
    }
  }))
}));

const { callOpenAI } = await import("../src/adapter");

const originalApiKey = process.env.OPENAI_API_KEY;

describe("callOpenAI", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    loadToolSpecsMock.mockResolvedValue([]);
    executeToolMock.mockResolvedValue({ output: "", isJson: false });
    createMock.mockResolvedValue({ id: "resp", output_text: "", tool_calls: [] });
    submitToolOutputsMock.mockResolvedValue({ output_text: "" });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("throws when API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      callOpenAI({
        prompt: "hello",
        context: "",
        model: "gpt",
        jsonMode: false,
        stream: false,
        timeoutMs: 1000
      })
    ).rejects.toThrow("OPENAI_API_KEY is required");
  });

  it("returns text for non-streaming calls without tools", async () => {
    createMock.mockResolvedValue({ id: "resp", output_text: "result", tool_calls: [] });

    const result = await callOpenAI({
      prompt: "hello",
      context: "context",
      model: "gpt",
      jsonMode: false,
      stream: false,
      timeoutMs: 1000
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.any(Array),
        model: "gpt"
      })
    );
    expect(result).toEqual({ exitCode: 0, text: "result", needsTool: false });
    expect(stdoutSpy).toHaveBeenCalledWith("result");
  });

  it("returns a tool request when execution is not supplied", async () => {
    createMock.mockResolvedValue({
      id: "resp",
      output_text: "pending",
      tool_calls: [
        {
          id: "call-1",
          function: { name: "whoami", arguments: "{}" }
        }
      ]
    });

    const result = await callOpenAI({
      prompt: "hello",
      context: "",
      model: "gpt",
      jsonMode: false,
      stream: false,
      timeoutMs: 1000
    });

    expect(result.needsTool).toBe(true);
    expect(result.exitCode).toBe(10);
    expect(result.tool).toEqual({ id: "call-1", name: "whoami", arguments: "{}" });
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("executes tools and submits outputs when provided", async () => {
    createMock.mockResolvedValue({
      id: "resp",
      output_text: "",
      tool_calls: [
        {
          id: "call-1",
          function: { name: "whoami", arguments: "{}" }
        }
      ]
    });
    executeToolMock.mockResolvedValue({ output: "tool-result", isJson: true });
    submitToolOutputsMock.mockResolvedValue({ output_text: "final" });

    const result = await callOpenAI({
      prompt: "hello",
      context: "",
      model: "gpt",
      jsonMode: false,
      stream: false,
      timeoutMs: 1000,
      toolExec: "./tool"
    });

    expect(executeToolMock).toHaveBeenCalledWith("./tool", {
      id: "call-1",
      name: "whoami",
      arguments: "{}"
    });
    expect(submitToolOutputsMock).toHaveBeenCalledWith("resp", {
      tool_outputs: [
        {
          tool_call_id: "call-1",
          output: "tool-result"
        }
      ]
    });
    expect(stdoutSpy).toHaveBeenCalledWith("final");
    expect(result).toEqual({ exitCode: 0, text: "final", needsTool: false });
  });
});
