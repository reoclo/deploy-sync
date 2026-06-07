# Reoclo Deploy Sync (`@reoclo/deploy-sync`)

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Reoclo%20Deploy%20Sync-2188ff?logo=github&logoColor=white)](https://github.com/marketplace/actions/reoclo-deploy-sync)
[![Release](https://img.shields.io/github/v/release/reoclo/deploy-sync?logo=github&label=release&color=2188ff&sort=semver)](https://github.com/reoclo/deploy-sync/releases/latest)
[![CI](https://github.com/reoclo/deploy-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/reoclo/deploy-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

## What this does

After an external CI pipeline builds and deploys container images, this action
notifies Reoclo so it can update its reverse-proxy routes to point at the newly
running containers. It runs `reoclo deploy sync` via the pinned Reoclo CLI and
writes a results table to the GitHub step summary.

Discovery can be automatic (from a docker-compose file) or explicit (a
comma-separated list of container names and ports). Outputs are exposed for
downstream steps.

## Setup

1. In the Reoclo dashboard, generate a tenant automation API key (`rca_*`) and
   enable the `external_deploy` operation scope for it.
2. Store the key in your repository or organisation secrets:
   `Settings > Secrets > Actions > New secret`, name it `REOCLO_API_KEY`.
3. Ensure the containers you want to sync are registered as Reoclo Applications
   with matching `linked_container_name` values.

## Usage

### Compose-based discovery

```yaml
- name: Sync Reoclo proxy routes
  uses: reoclo/deploy-sync@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    compose_file: docker-compose.prod.yml
```

Services are included automatically if they declare the `reoclo-proxy` network
or carry the `reoclo.managed=true` label (see [How discovery works](#how-discovery-works)).

### Explicit services list

```yaml
- name: Sync Reoclo proxy routes
  uses: reoclo/deploy-sync@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    services: 'web:3000,api:8080'
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api_key` | yes | — | Reoclo automation API key (`rca_*`) with `external_deploy` scope |
| `compose_file` | no | — | Path to a docker-compose file for auto-discovery |
| `services` | no | — | Comma-separated `container_name:port` pairs. Mutually exclusive with `compose_file`. |
| `api_url` | no | `https://api.reoclo.com` | Override for self-hosted Reoclo instances |
| `force` | no | `false` | Skip conflict checks. Use only for legitimate hotfixes. |

## Outputs

| Output | Description |
| --- | --- |
| `synced_fqdns` | Comma-separated FQDNs whose proxy routes were rewritten or confirmed |
| `session_id` | Reoclo deploy session ID for audit and tracing |

## How discovery works

When `compose_file` is provided, the CLI reads the YAML and includes a
service if **either** condition is true:

- The service's `networks` list or map contains `reoclo-proxy`.
- The service's `labels` list or map contains `reoclo.managed=true`.

Use `services:` instead of `compose_file:` when you do not have a compose file
in the repository, or when you need to sync containers that are not managed via
Compose at all.

## Status values

| Status | Meaning | Action to take |
| --- | --- | --- |
| `synced` | Proxy routes updated to match the new deployment | None — successful update |
| `noop` | Routes already matched the submitted state | None — already in sync |
| `conflict` | Submitted state conflicts with a signature from another source | Investigate, then rerun with `force: true` if intentional |
| `drift_recovered` | Reoclo detected drift and restored the correct state | Review why drift occurred |

If any result has status `conflict` and `force` is `false`, the CLI exits
non-zero. Set `force: true` to override.

## How It Works

`v2` is a thin wrapper around the [`reoclo` CLI](https://github.com/reoclo/cli)
(the same engine that powers Gitea Actions and Woodpecker), so behaviour is
identical across CI systems:

1. A composite step installs the pinned `reoclo` CLI (downloaded once per job;
   no Node runtime needed).
2. It runs `reoclo deploy sync … --output json` with `REOCLO_AUTOMATION_KEY`
   from `api_key`.
3. The CLI calls the Reoclo automation API and returns a JSON payload with
   `session_id`, `synced_fqdns`, and per-container `results`.
4. The action parses the JSON with `jq` (preinstalled on GitHub-hosted and
   standard Gitea `act_runner` images), writes outputs to `$GITHUB_OUTPUT`, and
   appends a markdown table to `$GITHUB_STEP_SUMMARY`.
5. The CLI's exit code is preserved — non-zero on conflict or errors — so the
   step fails correctly even after outputs are written.

## Gitea Actions

The repo is mirrored to `git.boxpositron.dev/reoclo/deploy-sync`, so the same
action runs on a self-hosted Gitea `act_runner`:

```yaml
- uses: git.boxpositron.dev/reoclo/deploy-sync@v2
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    compose_file: docker-compose.prod.yml
```

## Issues and support

For questions about the action or the External Deployments feature, see the
[Reoclo documentation](https://docs.reoclo.com/guides/external-deployments/).
For account or dashboard help, contact Reoclo support through the dashboard.
