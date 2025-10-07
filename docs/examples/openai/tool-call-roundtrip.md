# Example: Tool call round-trip

Demonstrate how `pai-openai` requests a tool, hands the payload to a resolver, and completes the conversation.

## Prepare the tool

Create a tool schema and resolver script:

```bash
mkdir -p tmp/tools
cat <<'JSON' > tmp/tools/echo.json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "echo_text",
        "description": "Return the provided text",
        "parameters": {
          "type": "object",
          "properties": {
            "text": { "type": "string" }
          },
          "required": ["text"]
        }
      }
    }
  ]
}
JSON

cat <<'SH' > tmp/tools/resolve-echo.sh
#!/usr/bin/env bash
set -euo pipefail
PAYLOAD=$(cat)
REQUEST=$(jq -r '.arguments.text' <<<"$PAYLOAD")
# Respond with a JSON object understood by the model
jq -n --arg echoed "$REQUEST" '{"tool_output": $echoed}'
SH
chmod +x tmp/tools/resolve-echo.sh
```

## Run the CLI

Trigger the tool and capture its request:

```bash
status=0
OUTPUT=$(npx pai-openai "Call echo_text with 'OpenAI rocks'" \
  --tool-spec tmp/tools/echo.json \
  --tool-exec tmp/tools/resolve-echo.sh \
  --stream false) || status=$?
if [ "$status" -eq 10 ]; then
  printf '%s\n' "$OUTPUT" > tmp/tools/tool-call.json
else
  if [ "$status" -ne 0 ]; then
    exit "$status"
  fi
  printf '%s\n' "$OUTPUT" > tmp/tools/final-response.json
fi
```

Verify that a tool call occurred and was satisfied:

```bash
jq -e '.tool_output == "OpenAI rocks"' tmp/tools/final-response.json
```

If the model instead stops to request manual handling, inspect `tmp/tools/tool-call.json` and reinvoke `pai-openai` with the tool output. The schema, resolver, and verification steps work unchanged on macOS and Linux.
