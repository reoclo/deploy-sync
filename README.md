# reoclo/deploy-sync

## What this does

After an external CI pipeline builds and deploys container images, this action
notifies Reoclo so it can update its reverse-proxy routes to point at the newly
running containers. It opens a short-lived deploy session, submits deployment
metadata for each discovered service, and revokes the session when finished.

The action uses Reoclo's external-deploy API endpoints. Discovery can be
automatic (from a docker-compose file) or explicit (a comma-separated list of
container names and ports). Results are written to the GitHub step summary and
exposed as outputs for downstream steps.

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
  uses: reoclo/deploy-sync@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    compose_file: docker-compose.prod.yml
```

Services are included automatically if they declare the `reoclo-proxy` network
or carry the `reoclo.managed=true` label (see [How discovery works](#how-discovery-works)).

### Explicit services list

```yaml
- name: Sync Reoclo proxy routes
  uses: reoclo/deploy-sync@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    services: 'web:3000,api:8080'
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api_key` | yes | — | Reoclo tenant API key (`rca_*`) with `external_deploy` scope |
| `compose_file` | no | — | Path to a docker-compose file for auto-discovery |
| `services` | no | — | Comma-separated `container_name:port` pairs. Mutually exclusive with `compose_file`. |
| `api_url` | no | `https://app.reoclo.com` | Override for self-hosted Reoclo instances |
| `force` | no | `false` | Skip conflict checks. Use only for legitimate hotfixes. |

## Outputs

| Output | Description |
| --- | --- |
| `synced_fqdns` | Comma-separated FQDNs whose proxy routes were rewritten or confirmed |
| `session_id` | Reoclo deploy session ID for audit and tracing |

## How discovery works

When `compose_file` is provided, the action reads the YAML and includes a
service if **either** condition is true:

- The service's `networks` list or map contains `reoclo-proxy`.
- The service's `labels` list or map contains `reoclo.managed=true`.

For each included service, the action extracts:

- `container_name` — the explicit `container_name` field, or the service key
  as a fallback (matching Docker Compose's own default naming).
- `container_port` — the first `expose:` entry, or the container side of the
  first `ports:` mapping.
- `image_tag` — the `image:` field as-is (may be null).

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

If any result has status `conflict` and `force` is `false`, the action exits
with a failure and lists the conflicting containers. Set `force: true` to
override.

## Issues and support

For questions about the action or the External Deployments feature, see the
[Reoclo documentation](https://docs.reoclo.com/guides/external-deployments/).
For account or dashboard help, contact Reoclo support through the dashboard.
