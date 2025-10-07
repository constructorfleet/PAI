# PAI OpenAI Adapter CLI

`pai-openai` is a provider-agnostic CLI wrapper for OpenAI's Responses API. It augments prompts with filesystem context, streams assistant output, and integrates with local tooling via hooks and tool call execution.

## Features

- Attach repository context using glob patterns or piped STDIN.
- Stream or batch responses, including JSON mode via `--json`.
- Detects and forwards function/tool calls with exit code `10` for automation.
- Optional local tool executor (`--tool-exec`) can respond to tool calls automatically.
- Pre/Post hook commands with environment injection for CI pipelines.
- Structured logging with configurable verbosity.

## Usage

```bash
pai-openai [prompt | -f prompt.txt] \
  [--model gpt-4.1 | --model o3-pro] \
  [--context 'src/**/*.ts' README.md --stdin] \
  [--tool-spec tools/schema.json] \
  [--pre 'scripts/pre.sh' --post 'node scripts/post.js'] \
  [--json --stream --out result.json]
```

See `pai-openai --help` for all flags.
