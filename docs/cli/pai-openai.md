# `pai-openai` CLI Guide

The `pai-openai` command wraps the OpenAI Responses API with PAI's context loader, hook runner, and tool executor. This document shows how to install the adapter, inspect flags, ingest filesystem context, and wire hooks for local development or CI.

## Installation

```bash
# Inside the PAI repository
cd provider-adapters/pai-openai

# Install dependencies
npm install

# Make sure the API key is available to the CLI
export OPENAI_API_KEY="sk-your-key"
```

For global usage, run `npm install --global` inside `provider-adapters/pai-openai` or install the published package from npm once available.

## Usage

Invoke the CLI with an inline prompt, `--file`, or piped STDIN:

```bash
# Inline prompt
npx pai-openai "Summarize the repository goals"

# Prompt from file
npx pai-openai --file prompts/summary.txt

# Pipe prompt over STDIN
cat prompt.md | npx pai-openai --stream false
```

Run `npx pai-openai --help` to view every option. Frequently used flags:

| Flag | Description |
| --- | --- |
| `--model <name>` | Override the model for a single invocation. Defaults to `OPENAI_MODEL` or `gpt-4.1`. |
| `--context <glob...>` | Attach one or more files/globs as reference context. Repeat for multiple entries. |
| `--stdin` | Treat STDIN as context instead of (or in addition to) the prompt. |
| `--json` | Enforce JSON-only responses (default: enabled). Combine with prompts that describe the schema you expect. |
| `--stream` | Stream output tokens (default: true). Set `--stream false` when capturing output for scripts. |
| `--tool-spec <path>` | Load a JSON Schema describing callable tools/functions. |
| `--tool-exec <command>` | Execute tool calls automatically by piping payloads to the specified command. |
| `--pre <command>` / `--post <command>` | Run shell hooks before/after the API call. PAI injects run metadata as env vars. |
| `--out <file>` | Write the final assistant text to a file for later inspection. |
| `--timeout <ms>` | Abort the request after the specified milliseconds (default: `OPENAI_TIMEOUT_MS` or 180s). |

## Filesystem context ingestion

The CLI expands globs, truncates oversized files, and concatenates content using a structured header format. Example:

```bash
npx pai-openai "Summarize local docs" \
  --context README.md "docs/**/*.md" \
  --max-context-bytes 120000
```

When `--stdin` is combined with a positional prompt or `--file`, STDIN is treated as context only. Use this pattern for `git diff` style workflows:

```bash
git diff | npx pai-openai "Review my changes" --stdin --json
```

You can inspect the generated context by setting `OPENAI_LOG_LEVEL=debug`; the CLI prints which files were included or trimmed.

## Hooks

Hooks allow pre/post automation around each request. Both commands receive environment variables with run metadata:

- `PROMPT`: The full prompt string used for the request.
- `MODEL`: The resolved model name.
- `RUN_ID`: A unique identifier for this execution.
- `CONTEXT_PATHS`: Comma-separated list of context file paths (pre hook only).
- `OUTPUT_FILE`: Value passed to `--out` (post hook only).
- `OUTPUT_TEXT`: Assistant response text (post hook only).
- `TOOL_NAME` / `TOOL_ARGS`: Present when a tool call occurred.
- `EXIT_CODE`: Final exit code from the OpenAI request or tool routing.

Example pre/post hook usage:

```bash
npx pai-openai "Write release notes" \
  --context CHANGELOG.md \
  --pre 'scripts/prepare-release.sh' \
  --post 'scripts/publish-release.sh'
```

Inside `scripts/prepare-release.sh` you could warm caches or export additional env vars, and the post hook can parse `OUTPUT_TEXT` to decide whether to open a pull request.

## Tool execution handoff

When the model emits a function call, `pai-openai` exits with status **10** and prints JSON describing the requested tool. Use `--tool-exec` to forward that payload to a resolver:

```bash
npx pai-openai "What is my git status?" \
  --tool-spec tools/git.json \
  --tool-exec './scripts/resolve-tool.sh'
```

`scripts/resolve-tool.sh` receives the JSON payload on STDIN and should print a JSON response understood by the model. It can decide to execute the command and then reinvoke `pai-openai` with the tool result.

Without `--tool-exec`, capture the payload and re-run the CLI manually:

```bash
status=0
OUTPUT=$(npx pai-openai --stream false "Run the whoami tool" --tool-spec tools/whoami.json) || status=$?
if [ "$status" -eq 10 ]; then
  printf '%s\n' "$OUTPUT" > tool-call.json
  cat tool-call.json | npx pai-openai "Tool result" --json
fi
```

## CI usage patterns

Combine hooks, context, and JSON mode for deterministic pipelines.

### Minimal smoke test

```bash
npx pai-openai --stream false "Respond with {\"status\": \"ok\"}" | jq -e '.status == "ok"'
```

### Pull request reviewer

```bash
export OPENAI_API_KEY="$OPENAI_API_KEY"
CHANGED_FILES=$(git diff --name-only origin/main...HEAD)

npx pai-openai "Summarize risk in the proposed changes" \
  --context $CHANGED_FILES \
  --stdin <<<"$(git diff)" \
  --json \
  --post 'scripts/notify-slack.sh'
```

### Fail the build on missing JSON

```bash
set -euo pipefail
OUTPUT=$(npx pai-openai "Return {\"status\":\"ready\"}" --json --stream false)
echo "$OUTPUT" | jq -e '.status == "ready"' >/dev/null
```

In GitHub Actions, run the CLI inside `provider-adapters/pai-openai` after checking out the repo and exporting `OPENAI_API_KEY`. Hooks inherit workflow env vars automatically.
