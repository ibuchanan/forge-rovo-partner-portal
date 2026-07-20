# Development

## Prerequisites

- Node.js version pinned in [`.nvmrc`](.nvmrc) (`nvm use`)
- The [Atlassian Forge CLI](https://developer.atlassian.com/platform/forge/cli-reference/)
- `src/index.ts` and `src/actionpayload.ts` import from `forge-ahead`, which is not listed in `package.json` and has no entry in `package-lock.json`. It is expected to be available locally (for example via `npm link`), matching the linked-library workflow described in `AGENTS.md`. The vitest suite mocks `forge-ahead/errors`, so `npm test` works without it, but `npm run build` and `npm run types` need it resolvable.

## Repository structure

- `manifest.yml` — Forge manifest: the `forge-rovo-partner-portal` `rovo:agent` module, its `search-partner-portal` action/function, and required scopes/egress.
- `prompts/agent-instructions.md` — the agent's system prompt, wired into the manifest via `resource:agent-prompts`.
- `src/index.ts` — `confluenceCqlSearch`, the function backing the action: builds the CQL search URL, authenticates with a Confluence service account, and calls the Confluence Search REST API.
- `src/actionpayload.ts` — payload types generated from `manifest.yml` by `npm run types`; do not hand-edit.
- `test/index.test.ts` — vitest unit tests covering success, empty results, API errors, network errors, and missing environment variables.
- `promptfooconfig.yaml`, `test/promptfoo-test.yaml`, `test/data/*.md` — promptfoo eval scenarios that simulate the agent's prompt against sample Confluence pages.

## Inner development loop

| Command | What it does |
| --- | --- |
| `npm run build` | Compile `src` with `tsc` into `dist` |
| `npm run check` | `biome check --write` (format + lint fixes) |
| `npm run format` | `biome format --write` |
| `npm run lint` | `biome lint` |
| `npm test` | Run the vitest unit tests |
| `npm run types` | Regenerate `src/actionpayload.ts` from `manifest.yml`, then format and compile |
| `npm run eval` | Run promptfoo evals against `test/promptfoo-test.yaml` |
| `npm run view` | Open the promptfoo results viewer |
| `npm run changelog` | Regenerate the changelog with `git cliff` |
| `npm run clean` | Remove `dist/` |

## Forge workflow

- Validate `manifest.yml` with `forge lint` after any change to it.
- Use `forge tunnel` for local iteration: code changes hot-reload through the tunnel, but a manifest change requires redeploying and restarting the tunnel.
- Redeploy and reinstall (`forge deploy`, then `forge install --upgrade`) whenever scopes or egress in `manifest.yml` change.
- Fetch app logs with `forge logs -e <environment> --since 15m` (or a larger window) to troubleshoot a deployed environment.

## Environment variables

Set per environment with `forge variable set <NAME> <value> --environment <environment>`:

- `CONFLUENCE_CLOUD_ID`
- `CONFLUENCE_SERVICE_ACCOUNT`
- `CONFLUENCE_API_TOKEN`

## Notes

- `package-lock.json` still carries the name of an earlier prototype (`explore-forge-wretch`). Regenerate it with a fresh `npm install` if that causes confusion.
