import * as core from "@actions/core";
import * as fs from "fs";
import { ReocloClient } from "./client.js";
import { discoverFromCompose, parseServicesList } from "./compose.js";
import type { DeploySyncRequestItem, DiscoveredService } from "./types.js";

async function run(): Promise<void> {
  let client: ReocloClient | null = null;

  try {
    const apiKey = core.getInput("api_key", { required: true });
    const composeFile = core.getInput("compose_file") || "";
    const servicesInput = core.getInput("services") || "";
    const apiUrl = core.getInput("api_url") || "https://api.reoclo.com";
    const forceInput = core.getInput("force") || "false";
    const force = forceInput.toLowerCase() === "true";

    // Validate mutually exclusive inputs
    const hasCompose = composeFile.trim() !== "";
    const hasServices = servicesInput.trim() !== "";

    if (hasCompose && hasServices) {
      core.setFailed(
        'Inputs "compose_file" and "services" are mutually exclusive — provide only one.',
      );
      return;
    }
    if (!hasCompose && !hasServices) {
      core.setFailed('Must provide either "compose_file" or "services" input.');
      return;
    }

    // Discover services
    let discovered: DiscoveredService[];
    if (hasCompose) {
      if (!fs.existsSync(composeFile)) {
        core.setFailed(`compose_file not found: ${composeFile}`);
        return;
      }
      discovered = await discoverFromCompose(composeFile);
    } else {
      discovered = parseServicesList(servicesInput);
    }

    if (discovered.length === 0) {
      core.setFailed("No services matched.");
      return;
    }

    core.info(`Discovered ${discovered.length} service(s): ${discovered.map((s) => s.container_name).join(", ")}`);

    client = new ReocloClient(apiKey, apiUrl);

    // Create session
    const sessionResponse = await client.createSession({
      container_names: discovered.map((s) => s.container_name),
      workflow_run_id: process.env["GITHUB_RUN_ID"],
      commit_sha: process.env["GITHUB_SHA"],
    });

    core.info(`Session created: ${sessionResponse.session_id}`);
    core.setOutput("session_id", sessionResponse.session_id);

    for (const app of sessionResponse.applications) {
      core.info(
        `Matched application: ${app.linked_container_name} (${app.bound_fqdns.join(", ")})`,
      );
    }
    for (const name of sessionResponse.unmatched) {
      core.warning(`Container "${name}" has no matching Reoclo application — skipping.`);
    }

    const unmatchedSet = new Set(sessionResponse.unmatched);

    // Build sync deployments
    const deployments: DeploySyncRequestItem[] = [];
    for (const svc of discovered) {
      if (unmatchedSet.has(svc.container_name)) continue;

      const deployment: DeploySyncRequestItem = {
        container_name: svc.container_name,
        container_port: svc.container_port,
        force,
      };
      if (svc.image_tag !== null) {
        deployment.image_tag = svc.image_tag;
      }
      deployments.push(deployment);
    }

    if (deployments.length === 0) {
      core.setFailed("No deployments to sync after filtering unmatched containers.");
      return;
    }

    // Sync
    const syncResponse = await client.sync({ deployments });

    // Process results
    const conflicts: string[] = [];
    const syncedFqdns: string[] = [];

    for (const result of syncResponse.results) {
      core.info(`${result.container_name}: ${result.status}${result.reason ? ` — ${result.reason}` : ""}`);
      if (result.status === "conflict") {
        conflicts.push(`${result.container_name}: ${result.reason ?? "conflict"}`);
      }
      if (result.status === "synced" || result.status === "drift_recovered") {
        syncedFqdns.push(...result.synced_fqdns);
      }
    }

    for (const err of syncResponse.errors) {
      core.warning(`Sync error for "${err.container_name}": ${err.reason}`);
    }

    // Step summary
    const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
    if (summaryFile) {
      const rows = syncResponse.results.map((r) => {
        const statusLabel = statusDisplay(r.status);
        const fqdns = r.synced_fqdns.join(", ") || "-";
        const notes = r.reason ?? "-";
        const app = sessionResponse.applications.find(
          (a) => a.linked_container_name === r.container_name,
        );
        const image =
          discovered.find((s) => s.container_name === r.container_name)?.image_tag ?? "-";
        return `| ${app?.id ?? r.application_id} | ${statusLabel} | ${image} | ${fqdns} | ${notes} |`;
      });

      const errorRows = syncResponse.errors.map(
        (e) => `| - | error | - | - | ${e.container_name}: ${e.reason} |`,
      );

      const summary = [
        "## Reoclo Deploy Sync",
        "",
        `Session: \`${syncResponse.session_id}\``,
        "",
        "| Application | Status | Image | FQDNs synced | Notes |",
        "| --- | --- | --- | --- | --- |",
        ...rows,
        ...errorRows,
      ].join("\n");

      fs.appendFileSync(summaryFile, summary + "\n");
    }

    // Set outputs
    const uniqueFqdns = [...new Set(syncedFqdns)];
    core.setOutput("synced_fqdns", uniqueFqdns.join(","));

    // Determine exit
    if (conflicts.length > 0 && !force) {
      core.setFailed(
        `Sync conflicts detected (set force=true to override):\n${conflicts.join("\n")}`,
      );
      return;
    }
    if (syncResponse.errors.length > 0) {
      const errorList = syncResponse.errors
        .map((e) => `${e.container_name}: ${e.reason}`)
        .join("\n");
      core.setFailed(`Sync errors:\n${errorList}`);
      return;
    }

    core.info("Deploy sync completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed: ${message}`);
  } finally {
    if (client) {
      try {
        await client.revokeSession();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        core.warning(`Failed to revoke deploy session: ${msg}`);
      }
    }
  }
}

function statusDisplay(status: string): string {
  switch (status) {
    case "synced":
      return "synced";
    case "noop":
      return "noop (already in sync)";
    case "conflict":
      return "conflict (requires force)";
    case "drift_recovered":
      return "drift_recovered (was found correct already)";
    default:
      return status;
  }
}

run();
