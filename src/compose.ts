import { readFile } from "fs/promises";
import { parse } from "yaml";
import * as core from "@actions/core";
import type { DiscoveredService } from "./types.js";

interface RawService {
  container_name?: string;
  image?: string;
  networks?: string[] | Record<string, unknown>;
  labels?: string[] | Record<string, string>;
  expose?: Array<string | number>;
  ports?: Array<string | number | { target?: number; published?: number }>;
}

interface RawCompose {
  services?: Record<string, RawService>;
}

function hasReocloNetwork(networks: RawService["networks"]): boolean {
  if (!networks) return false;
  if (Array.isArray(networks)) {
    return networks.includes("reoclo-proxy");
  }
  return "reoclo-proxy" in networks;
}

function hasReocloLabel(labels: RawService["labels"]): boolean {
  if (!labels) return false;
  if (Array.isArray(labels)) {
    return labels.some((l) => l === "reoclo.managed=true");
  }
  return labels["reoclo.managed"] === "true";
}

function extractPort(service: RawService): number | null {
  // Try expose first
  if (service.expose && service.expose.length > 0) {
    const first = service.expose[0];
    if (first !== undefined) {
      const n = parseInt(String(first), 10);
      if (!isNaN(n)) return n;
    }
  }
  // Try ports
  if (service.ports && service.ports.length > 0) {
    const first = service.ports[0];
    if (first !== undefined) {
      if (typeof first === "number") return first;
      if (typeof first === "string") {
        // Could be "4321", "8080:80", "0.0.0.0:8080:80"
        const parts = first.split(":");
        const containerPart = parts[parts.length - 1];
        if (containerPart) {
          const n = parseInt(containerPart, 10);
          if (!isNaN(n)) return n;
        }
      }
      if (typeof first === "object" && first !== null && "target" in first) {
        const target = first.target;
        if (typeof target === "number") return target;
      }
    }
  }
  return null;
}

export async function discoverFromCompose(composeFilePath: string): Promise<DiscoveredService[]> {
  const content = await readFile(composeFilePath, "utf-8");
  const doc = parse(content) as RawCompose;

  if (!doc.services) {
    return [];
  }

  const results: DiscoveredService[] = [];

  for (const [serviceKey, service] of Object.entries(doc.services)) {
    if (!service) continue;

    const included =
      hasReocloNetwork(service.networks) || hasReocloLabel(service.labels);

    if (!included) continue;

    const container_name = service.container_name ?? serviceKey;
    const container_port = extractPort(service);
    const image_tag = service.image ?? null;

    if (container_port === null) {
      core.warning(
        `Service "${serviceKey}" is managed by Reoclo but has no exposed or mapped port — skipping.`,
      );
      continue;
    }

    results.push({ container_name, container_port, image_tag });
  }

  return results;
}

export function parseServicesList(input: string): DiscoveredService[] {
  const results: DiscoveredService[] = [];
  for (const entry of input.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.lastIndexOf(":");
    if (colonIdx === -1) {
      throw new Error(
        `Invalid services entry "${trimmed}" — expected format "container_name:port"`,
      );
    }
    const name = trimmed.slice(0, colonIdx).trim();
    const portStr = trimmed.slice(colonIdx + 1).trim();
    const port = parseInt(portStr, 10);
    if (!name) {
      throw new Error(`Invalid services entry "${trimmed}" — container name is empty`);
    }
    if (isNaN(port) || port <= 0) {
      throw new Error(
        `Invalid services entry "${trimmed}" — port "${portStr}" is not a valid number`,
      );
    }
    results.push({ container_name: name, container_port: port, image_tag: null });
  }
  return results;
}
