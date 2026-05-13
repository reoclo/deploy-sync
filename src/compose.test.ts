import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverFromCompose, parseServicesList } from "./compose.js";
import * as fs from "fs/promises";

vi.mock("fs/promises");
vi.mock("@actions/core", () => ({ warning: vi.fn(), info: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadFile = vi.mocked(fs.readFile) as any;

describe("parseServicesList", () => {
  it("parses a single name:port entry", () => {
    const result = parseServicesList("myapp:8080");
    expect(result).toEqual([
      { container_name: "myapp", container_port: 8080, image_tag: null },
    ]);
  });

  it("parses multiple comma-separated entries", () => {
    const result = parseServicesList("web:3000,api:4000");
    expect(result).toEqual([
      { container_name: "web", container_port: 3000, image_tag: null },
      { container_name: "api", container_port: 4000, image_tag: null },
    ]);
  });

  it("trims whitespace around entries", () => {
    const result = parseServicesList("  web:3000 , api:4000  ");
    expect(result).toHaveLength(2);
    expect(result[0]?.container_name).toBe("web");
    expect(result[1]?.container_name).toBe("api");
  });

  it("throws when port is missing", () => {
    expect(() => parseServicesList("myapp")).toThrow('Invalid services entry "myapp"');
  });

  it("throws when port is not a valid number", () => {
    expect(() => parseServicesList("myapp:notaport")).toThrow("not a valid number");
  });

  it("skips empty entries from trailing comma", () => {
    const result = parseServicesList("web:3000,");
    expect(result).toHaveLength(1);
  });
});

describe("discoverFromCompose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discovers service with reoclo-proxy network as list", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: ghcr.io/org/web:abc123
    container_name: portfolio-prod-frontend
    networks:
      - reoclo-proxy
    expose:
      - "4321"
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result).toEqual([
      {
        container_name: "portfolio-prod-frontend",
        container_port: 4321,
        image_tag: "ghcr.io/org/web:abc123",
      },
    ]);
  });

  it("discovers service with reoclo-proxy network as map", async () => {
    mockReadFile.mockResolvedValue(`
services:
  api:
    image: myimage:latest
    networks:
      reoclo-proxy:
        aliases:
          - api
      internal: {}
    expose:
      - "8080"
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result).toHaveLength(1);
    expect(result[0]?.container_name).toBe("api");
    expect(result[0]?.container_port).toBe(8080);
  });

  it("discovers service with reoclo.managed=true label as list", async () => {
    mockReadFile.mockResolvedValue(`
services:
  frontend:
    image: frontend:v2
    labels:
      - "reoclo.managed=true"
    ports:
      - "3000:3000"
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result).toHaveLength(1);
    expect(result[0]?.container_name).toBe("frontend");
    expect(result[0]?.container_port).toBe(3000);
  });

  it("discovers service with reoclo.managed=true label as map", async () => {
    mockReadFile.mockResolvedValue(`
services:
  backend:
    image: backend:v1
    labels:
      reoclo.managed: "true"
    expose:
      - "5000"
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result).toHaveLength(1);
    expect(result[0]?.container_name).toBe("backend");
    expect(result[0]?.container_port).toBe(5000);
  });

  it("skips services with neither network nor label", async () => {
    mockReadFile.mockResolvedValue(`
services:
  db:
    image: postgres:16
    expose:
      - "5432"
  web:
    image: web:latest
    networks:
      - reoclo-proxy
    expose:
      - "3000"
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result).toHaveLength(1);
    expect(result[0]?.container_name).toBe("web");
  });

  it("falls back to service key when container_name is not set", async () => {
    mockReadFile.mockResolvedValue(`
services:
  myservice:
    image: myimage:latest
    networks:
      - reoclo-proxy
    expose:
      - "8000"
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result[0]?.container_name).toBe("myservice");
  });

  it("parses port from ports mapping with host:container format", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: web:latest
    networks:
      - reoclo-proxy
    ports:
      - "8080:80"
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result[0]?.container_port).toBe(80);
  });

  it("warns and skips service with no port", async () => {
    const { warning } = await import("@actions/core");
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: web:latest
    networks:
      - reoclo-proxy
`);

    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result).toHaveLength(0);
    expect(vi.mocked(warning)).toHaveBeenCalledWith(
      expect.stringContaining("no exposed or mapped port"),
    );
  });

  it("returns empty array when no services key", async () => {
    mockReadFile.mockResolvedValue(`version: "3.8"\n`);
    const result = await discoverFromCompose("/fake/docker-compose.yml");
    expect(result).toEqual([]);
  });
});
