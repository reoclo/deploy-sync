import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReocloClient } from "./client.js";

const { mockPostJson, mockGetJson, mockDel } = vi.hoisted(() => ({
  mockPostJson: vi.fn(),
  mockGetJson: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock("@actions/http-client", () => {
  const HttpClient = vi.fn(function () {
    return { postJson: mockPostJson, getJson: mockGetJson, del: mockDel };
  });
  return { HttpClient };
});

describe("ReocloClient", () => {
  let client: ReocloClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ReocloClient("rca_testkey", "https://app.reoclo.com");
  });

  describe("createSession", () => {
    it("creates a session and stores the session token", async () => {
      const mockResponse = {
        session_id: "sess-uuid",
        session_token: "rds_abc",
        expires_at: "2026-05-14T00:00:00Z",
        applications: [
          {
            id: "app-uuid",
            linked_container_name: "portfolio-prod-frontend",
            container_port: 4321,
            bound_fqdns: ["boxpositron.dev"],
          },
        ],
        unmatched: [],
      };
      mockPostJson.mockResolvedValue({ statusCode: 201, result: mockResponse });

      const result = await client.createSession({
        container_names: ["portfolio-prod-frontend"],
        workflow_run_id: "12345",
        commit_sha: "abc123",
      });

      expect(result.session_id).toBe("sess-uuid");
      expect(result.session_token).toBe("rds_abc");
      expect(mockPostJson).toHaveBeenCalledWith(
        "https://app.reoclo.com/external-deploy/session",
        expect.objectContaining({ container_names: ["portfolio-prod-frontend"] }),
      );
    });

    it("throws on 403 response", async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 403,
        result: { message: "Forbidden: missing external_deploy scope" },
      });

      await expect(
        client.createSession({ container_names: ["web"] }),
      ).rejects.toThrow("Reoclo API returned 403");
    });

    it("throws on 400 response", async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 400,
        result: { message: "No container names matched" },
      });

      await expect(
        client.createSession({ container_names: ["nonexistent"] }),
      ).rejects.toThrow("Reoclo API returned 400");
    });

    it("throws on empty result body", async () => {
      mockPostJson.mockResolvedValue({ statusCode: 201, result: null });

      await expect(
        client.createSession({ container_names: ["web"] }),
      ).rejects.toThrow("empty response");
    });
  });

  describe("sync", () => {
    beforeEach(async () => {
      // Establish session first
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          session_id: "sess-uuid",
          session_token: "rds_abc",
          expires_at: "2026-05-14T00:00:00Z",
          applications: [],
          unmatched: [],
        },
      });
      await client.createSession({ container_names: ["web"] });
    });

    it("posts to sync endpoint and returns results", async () => {
      const mockSyncResponse = {
        session_id: "sess-uuid",
        results: [
          {
            application_id: "app-uuid",
            container_name: "web",
            status: "synced",
            signature_hash: "sha256:abc",
            synced_fqdns: ["example.com"],
            reason: null,
          },
        ],
        errors: [],
      };
      mockPostJson.mockResolvedValue({ statusCode: 200, result: mockSyncResponse });

      const result = await client.sync({
        deployments: [{ container_name: "web", container_port: 3000 }],
      });

      expect(result.results[0]?.status).toBe("synced");
      expect(mockPostJson).toHaveBeenCalledWith(
        "https://app.reoclo.com/external-deploy/sync",
        expect.objectContaining({ deployments: expect.any(Array) }),
      );
    });

    it("returns conflict status without throwing", async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 200,
        result: {
          session_id: "sess-uuid",
          results: [
            {
              application_id: "app-uuid",
              container_name: "web",
              status: "conflict",
              signature_hash: "sha256:abc",
              synced_fqdns: [],
              reason: "Signature mismatch",
            },
          ],
          errors: [],
        },
      });

      const result = await client.sync({
        deployments: [{ container_name: "web", container_port: 3000 }],
      });

      expect(result.results[0]?.status).toBe("conflict");
    });

    it("throws when called without a session", async () => {
      const freshClient = new ReocloClient("rca_key", "https://app.reoclo.com");
      await expect(
        freshClient.sync({ deployments: [] }),
      ).rejects.toThrow("No session token");
    });
  });

  describe("revokeSession", () => {
    it("calls DELETE and does not throw on 204", async () => {
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          session_id: "sess-uuid",
          session_token: "rds_abc",
          expires_at: "2026-05-14T00:00:00Z",
          applications: [],
          unmatched: [],
        },
      });
      await client.createSession({ container_names: ["web"] });

      mockDel.mockResolvedValue({ message: { statusCode: 204 } });
      await expect(client.revokeSession()).resolves.toBeUndefined();
    });

    it("swallows non-200 errors without throwing", async () => {
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          session_id: "sess-uuid",
          session_token: "rds_abc",
          expires_at: "2026-05-14T00:00:00Z",
          applications: [],
          unmatched: [],
        },
      });
      await client.createSession({ container_names: ["web"] });

      mockDel.mockRejectedValue(new Error("Network error"));
      await expect(client.revokeSession()).resolves.toBeUndefined();
    });

    it("does nothing when no session has been created", async () => {
      await expect(client.revokeSession()).resolves.toBeUndefined();
      expect(mockDel).not.toHaveBeenCalled();
    });
  });
});
