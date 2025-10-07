# OpenAI Provider for PAI

The OpenAI adapter pairs PAI's context loaders, hook runner, and tool bridge with the OpenAI Responses API. This guide explains how to configure the provider, choose the right model, enable JSON mode, stream output safely, and migrate existing Anthropic workflows.

## Environment configuration

PAI reads configuration from environment variables before every run. The table below lists the supported knobs and their defaults.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | ✅ | — | Secret key used to authenticate with api.openai.com or an Enterprise endpoint. |
| `OPENAI_BASE_URL` | ❌ | `https://api.openai.com/v1` | Override when routing through a proxy or Azure-hosted endpoint. Must expose the Responses API. |
| `OPENAI_MODEL` | ❌ | `gpt-4.1` | CLI default model when `--model` flag is omitted. |
| `OPENAI_PROJECT` | ❌ | — | Optional project/workspace identifier for Enterprise accounts. |
| `OPENAI_TIMEOUT_MS` | ❌ | `180000` | Maximum time (ms) the CLI will wait before aborting the request. Mirrors the `--timeout` flag. |
| `OPENAI_JSON_MODE` | ❌ | `true` | Set to `false` to make `--json` opt-in instead of default. |
| `OPENAI_MAX_CONTEXT_BYTES` | ❌ | — | Hard cap for attached context. Mirrors `--max-context-bytes`. |
| `OPENAI_MAX_FILE_BYTES` | ❌ | — | Maximum size for a single context file. Mirrors `--max-file-bytes`. |

> [!TIP]
> Add the variables to `${PAI_DIR}/.env` and source them in your shell profile so hooks inherit the same configuration.

## Model guide

| Capability | `gpt-4.1-mini` | `gpt-4.1` | `o3-pro` | `gpt-5`* |
| --- | --- | --- | --- | --- |
| Max input tokens | ~128k | ~128k | ~200k | ≥256k (preview) |
| Reasoning / tool calls | ✅ | ✅ | ✅ (slow deliberate mode) | ✅ |
| JSON mode quality | Great | Great | Deterministic | Great |
| Best for | Drafting, summaries | Balanced agent workflows | Long-form reasoning, orchestrating tools | Multimodal & future-proofing |

*`gpt-5` availability depends on account access. Set `OPENAI_MODEL=gpt-5` or pass `--model gpt-5` once the model is enabled in your workspace.

PAI treats the model value as an opaque string—if OpenAI ships new SKUs you can adopt them immediately with the same CLI.

## JSON mode

Enable structured output with the `--json` flag (on by default) or by keeping `OPENAI_JSON_MODE=true`. The adapter translates that into OpenAI's `response_format` payload:

```jsonc
{
  "response_format": { "type": "json_object" }
}
```

Because the Responses API enforces strict JSON when this flag is set, downstream scripts can safely parse output with `jq`, and the CLI will exit with status `0` as long as the call succeeds.

To request a specific schema, provide a JSON Schema file via `--tool-spec` or embed instructions in your prompt. Example prompt:

> Return a JSON object with `summary` (string) and `action_items` (array of strings).

## Tool calls

Tool execution follows the Responses function-call contract. Point `--tool-spec` at a JSON schema that describes available functions, and optionally pass `--tool-exec <command>` to auto-resolve calls. When the model requests a tool:

1. `pai-openai` exits with code **10** and prints the tool call payload to STDOUT.
2. CI or local scripts inspect the payload and run the requested executable.
3. Provide the tool's return value to a follow-up `pai-openai` invocation (round-trip), or let `--tool-exec` capture the request and respond inline.

Schema snippet:

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_notes",
        "description": "Query local Markdown notes",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string" }
          },
          "required": ["query"]
        }
      }
    }
  ]
}
```

PAI injects context file paths and run metadata into the environment (`PROMPT`, `MODEL`, `RUN_ID`, etc.) before invoking hooks or tool executors so you can branch on them inside your scripts.

## Streaming behaviour

`pai-openai` streams Server-Sent Events by default. On interactive TTYs you will see tokens in real time; in non-TTY environments (CI, redirected output) the CLI buffers events and writes a single block at the end. Disable streaming with `--stream false` when you prefer a single flush regardless of terminal type.

## Context limits & truncation

The adapter keeps requests within OpenAI's context window by trimming attached files and STDIN:

- Combined context is truncated to `OPENAI_MAX_CONTEXT_BYTES` / `--max-context-bytes` using UTF-8 byte length.
- Individual files are limited by `OPENAI_MAX_FILE_BYTES` / `--max-file-bytes`; oversized files are skipped with a warning.
- Prompts that still exceed the model window trigger an error before the network call, allowing you to split the workload.

## Migration: Anthropic → OpenAI

1. Set `OPENAI_API_KEY` (and optional `OPENAI_BASE_URL`) in `${PAI_DIR}/.env`.
2. Update `${PAI_DIR}/settings.json` or workflow configs to set `"provider": "openai"`.
3. Replace `pai-anthropic` CLI invocations with `pai-openai` while keeping the same context globs and hooks.
4. If you depended on Claude's verbose JSON, enable `--json` and update downstream parsers to expect strict RFC8259 output.
5. Regenerate any cached tool schemas—the OpenAI adapter uses standard JSON Schema without Anthropic-specific extensions.

After these changes, run `pai-openai --help` to confirm the CLI resolves and make a smoke request: `pai-openai 'confirm OpenAI wiring works' --stream false`.
