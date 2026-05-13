# reoclo/deploy-sync

GitHub Action to sync proxy routes with Reoclo after an external container
deployment (e.g. a workflow that runs `docker compose up` on a server that
Reoclo manages routing for).

> **Status: scaffold.** v1 is not yet released. See `reoclo/core` for the
> tracking PR. Do not consume this action in a workflow until a `v1` tag
> is published to the GitHub Marketplace.

## Planned usage

```yaml
- uses: reoclo/deploy-sync@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    compose_file: ./docker-compose.prod.yml
```

The action exchanges a tenant-scoped Reoclo API key for a short-lived
deploy session, discovers services from the compose file (or an explicit
list), and tells Reoclo to update `proxy_routes` for every domain bound
to the matching applications. Idempotent reruns are detected via per-app
deployment signatures.

## Source / mirroring

- **Development source:** [git.boxpositron.dev/reoclo/github-action-deploy-sync](https://git.boxpositron.dev/reoclo/github-action-deploy-sync)
- **GitHub mirror:** this repository. Push-mirrored from Gitea — do not push directly.
