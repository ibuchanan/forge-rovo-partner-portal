# Forge Rovo Partner Portal

[![Atlassian license](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

A Rovo agent for searching Partner Portal content using Confluence CQL. It is an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app: a `rovo:agent` module backed by a single action, `search-partner-portal`, that queries the Confluence CQL Search REST API on behalf of a service account and returns matching pages.

## Status and ownership

- Status: single-site Forge app, not published to Atlassian Marketplace
- Owner: [@ibuchanan](https://github.com/ibuchanan) (see `.atlassian/OWNER`)
- License: [Apache 2.0](LICENSE)

## How it works

- `manifest.yml` declares the `Partner Portal Agent` (`forge-rovo-partner-portal`), its conversation starter, and the `search-partner-portal` action.
- `prompts/agent-instructions.md` is the agent's system prompt, telling it when and how to call the search action.
- `src/index.ts` implements `confluenceCqlSearch`: it builds a CQL query from the agent's `searchText` input, authenticates with a Confluence service account, and calls `https://api.atlassian.com/ex/confluence/<cloudId>/wiki/rest/api/search`.
- The app requests the `search:confluence` and `read:chat:rovo` scopes and egresses only to `api.atlassian.com` (see `manifest.yml`).

## Prerequisites

- Node.js, pinned in [`.nvmrc`](.nvmrc) (`nvm use`)
- The [Atlassian Forge CLI](https://developer.atlassian.com/platform/forge/cli-reference/), logged in with `forge login`
- An Atlassian Cloud site with Confluence and Rovo enabled
- A Confluence service account and API token with access to the Partner Portal space

## Setup

Set the service-account credentials the app needs to call the Confluence Search API, once per environment:

```sh
forge variable set CONFLUENCE_CLOUD_ID <your-cloud-id> --environment development
forge variable set CONFLUENCE_SERVICE_ACCOUNT <service-account-email> --environment development
forge variable set CONFLUENCE_API_TOKEN <api-token> --environment development
```

## Deploy and install

```sh
forge deploy --non-interactive --e development
forge install --non-interactive --site <your-site>.atlassian.net --product <product-name> --environment development
```

Re-run both commands whenever `manifest.yml` scopes or egress change.

## Try it

Once installed, start the agent in Rovo chat with its conversation starter: "Search the Partner Portal for pages about Rovo".

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for the build, lint, test, eval, and Forge tunnel workflow, plus repository structure notes.

## Contributing

Contributions, issues, and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md), including the CLA required for external contributors, and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Copyright (c) 2025 Atlassian US., Inc. Apache 2.0 licensed, see [LICENSE](LICENSE).
