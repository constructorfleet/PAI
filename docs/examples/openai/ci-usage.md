# Example: CI pipeline integration

Use `pai-openai` inside continuous integration to block merges when generated output fails validation.

## GitHub Actions step

```yaml
- name: Install OpenAI adapter
  working-directory: provider-adapters/pai-openai
  run: npm ci

- name: Run structured analysis
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    cd provider-adapters/pai-openai
    OUTPUT=$(npx pai-openai --stream false --json "Return {\"status\":\"pass\", \"notes\":[\"ok\"]}")
    jq -e '.status == "pass"' <<<"$OUTPUT"
```

## GitLab CI job

```yaml
openai_audit:
  image: node:20
  script:
    - cd provider-adapters/pai-openai
    - npm ci
    - |
      REPORT=$(npx pai-openai \
        "Summarize risk in the diff as JSON {status, blockers}" \
        --stdin <<<"$(git diff)" \
        --json \
        --stream false)
      echo "$REPORT" | jq -e '.status == "pass"'
  only:
    - merge_requests
```

Both pipelines rely on strict JSON mode plus `jq` verification, so failures exit with a non-zero status without additional scripting.
