# Development

## Prerequisites

- Node.js version pinned in [`.nvmrc`](.nvmrc) (`nvm use`)
- The [Atlassian Forge CLI](https://developer.atlassian.com/platform/forge/cli-reference/)

## Repository structure

- `manifest.yml` — Forge manifest: the `forge-rovo-partner-portal` `rovo:agent` module, its `search-partner-portal` action/function, and required scopes/egress.
- `prompts/agent-instructions.md` — the agent's system prompt, wired into the manifest via `resource:agent-prompts`.
- `src/index.ts` — `confluenceCqlSearch`, the function backing the action: builds the CQL search URL, authenticates with a Confluence service account, and calls the Confluence Search REST API.
- `src/actionpayload.ts` — payload types generated from `manifest.yml` by `npm run types`; do not hand-edit.
- `src/forgeFunction.ts` — local type definitions for the Forge function handler contract (`CommonEvent`, `EventContext`, `InstallContext`) based on Atlassian's function-arguments reference, since no published package provides them.
- `src/types.ts` — shared JSON-safe type helpers (`JSONValue`, `JSONObject`, `JSONArray`, `UniquelyIdentifiedObject`) used by `forgeFunction.ts`.
- `test/index.test.ts` — vitest unit tests covering success, empty results, API errors, network errors, and missing environment variables.
- `promptfooconfig.yaml`, `test/promptfoo-test.yaml`, `test/data/*.md` — promptfoo eval scenarios that simulate the agent's prompt against sample Confluence pages.
- `secretspec.toml` — declares the secrets/config this app needs (see [Environment variables](#environment-variables)).
- `scripts/forge-vars-from-secretspec.js` — uploads every secret declared in `secretspec.toml` to Forge as an encrypted variable; run via `npm run forge:variables:set`.
- `scripts/package.json` — `{ "type": "module" }`, scoping ES module syntax to `scripts/` only, without changing how the root package (or `tsc`'s `dist/` output) is interpreted.

## Inner development loop

| Command | What it does |
| --- | --- |
| `npm run build` | Compile `src` with `tsc` into `dist` |
| `npm run check` | `biome check --write` (format + lint fixes) |
| `npm run format` | `biome format --write` |
| `npm run lint` | `biome lint` |
| `npm run lint:forge` | `forge lint` |
| `npm run lint:prelint` | Check this repo's Forge conventions with `@forge-ahead/prelint` (`ast-grep`) |
| `npm test` | Run the vitest unit tests |
| `npm run types` | Regenerate `src/actionpayload.ts` from `manifest.yml`, then format and compile |
| `npm run eval` | Run promptfoo evals against `test/promptfoo-test.yaml` |
| `npm run view` | Open the promptfoo results viewer |
| `npm run size` | Build, then check `dist/index.js` against the `size-limit` budget in `package.json` |
| `npm run forge:variables:set` | Upload the secrets declared in `secretspec.toml` to Forge (see [Environment variables](#environment-variables)) |
| `npm run changelog` | Regenerate the changelog with `git cliff` |
| `npm run clean` | Remove `node_modules`, `package-lock.json`, and `dist/` |

## Forge workflow

- Validate `manifest.yml` with `forge lint` after any change to it.
- Use `forge tunnel` for local iteration: code changes hot-reload through the tunnel, but a manifest change requires redeploying and restarting the tunnel.
- Redeploy and reinstall (`forge deploy`, then `forge install --upgrade`) whenever scopes or egress in `manifest.yml` change.
- Fetch app logs with `forge logs -e <environment> --since 15m` (or a larger window) to troubleshoot a deployed environment.

## Environment variables

This app needs three Confluence service-account values, uploaded per Forge environment:

- `CONFLUENCE_CLOUD_ID`
- `CONFLUENCE_SERVICE_ACCOUNT`
- `CONFLUENCE_API_TOKEN`

Set them one at a time:

```sh
forge variables set --encrypt --environment development CONFLUENCE_CLOUD_ID <your-cloud-id>
forge variables set --encrypt --environment development CONFLUENCE_SERVICE_ACCOUNT <service-account-email>
forge variables set --encrypt --environment development CONFLUENCE_API_TOKEN <api-token>
```

...or upload all three at once via `secretspec.toml` and the `secretspec` Node SDK, instead of running three separate commands by hand:

1. Create an untracked `.env` (already covered by `.gitignore`) with those three values, plus `FORGE_ENVIRONMENT` (the environment name to target — `secretspec.toml` requires it, but `scripts/forge-vars-from-secretspec.js` only uses it to target the calls below; it's never uploaded itself).
2. Run `npm run forge:variables:set`. It resolves `secretspec.toml` against that `.env` and calls `forge variables set --encrypt` for every declared secret except `FORGE_ENVIRONMENT`.

## Notes

- `npm run lint:prelint` currently reports 2 `error`s about `tsconfig.json`'s `module`/`moduleResolution` needing to be `CommonJS`/`Node`. That's intentional: classic `Node` resolution can't read package.json `exports` maps at all, which broke real subpath imports (`@forge-ahead/logging/demo`) on this app's actual `nodejs24.x` runtime. `NodeNext`/`NodeNext` is what's needed here — see the comment in `tsconfig.json`. Worth raising upstream in `tool-forge-prelint-ast-grep`, since its rule assumes a Forge Node 18 runtime.
