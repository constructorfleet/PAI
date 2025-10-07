# PAI OpenAI Adapter Agent Instructions

## Architecture and purpose
The `pai-openai` package is a TypeScript CLI that wraps OpenAI's Responses API for use inside PAI workflows. `src/cli.ts` is the entrypoint that parses flags with Yargs, builds repository context via `context.ts`, orchestrates pre/post hooks from `hooks.ts`, and delegates API calls to `adapter.ts`. The adapter streams or batches responses, enforces JSON mode when requested, and brokers tool execution through `tools.ts`. Shared types live in `types.ts`, while `log.ts` centralizes structured logging.

## Development guidelines
- Always use concrete, well-defined TypeScript types. Prefer explicit interfaces, discriminated unions, and helper generics instead of `any` or overly loose structural typing.
- Run linting before every commit: `npm run lint`.
- Run tests before every commit: `npm test` (or `npm run test`).
