# PAI Agent Instructions

## Project overview
PAI (Personal AI Infrastructure) is an open-source framework for orchestrating personal and professional workflows with AI. The repository collects the core configuration, shared tooling, and provider-specific adapters that let PAI connect large language models to local context, automation hooks, and custom tools.

## Provider adapters
- `provider-adapters/pai-openai`: A TypeScript CLI wrapper around OpenAI's Responses API that enriches prompts with repository context, streams responses, and executes declared tool calls.
