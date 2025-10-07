# Example: Summarize repository context

This workflow pulls structured context from the filesystem and forces a JSON response that can be validated with `jq`.

## Steps

1. Export credentials and install dependencies:
   ```bash
   export OPENAI_API_KEY="sk-your-key"
   cd provider-adapters/pai-openai
   npm install
   ```
2. Ask for a summary of the README while enforcing JSON mode:
   ```bash
   npx pai-openai \
     "Return a JSON object with summary (string) and key_points (array of strings) for README.md" \
     --context ../../README.md \
     --json \
     --stream false \
     --out /tmp/pai-readme-summary.json
   ```
3. Validate the response structure:
   ```bash
   jq -e '.summary and (.key_points | type == "array")' /tmp/pai-readme-summary.json
   ```

`jq` exits with status `0` when the assistant respected the schema, making the snippet CI-friendly on both macOS and Linux.
