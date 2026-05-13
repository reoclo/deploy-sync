import { HttpClient } from "@actions/http-client";
import type {
  DeploySessionCreateRequest,
  DeploySessionCreateResponse,
  DeploySyncRequest,
  DeploySyncResponse,
} from "./types.js";

export class ReocloClient {
  private baseUrl: string;
  private apiKey: string;
  private sessionToken: string | null = null;
  private sessionId: string | null = null;

  constructor(apiKey: string, apiUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = apiUrl.replace(/\/+$/, "");
  }

  private makeHttp(token: string): HttpClient {
    return new HttpClient("reoclo-github-action", [], {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async createSession(
    request: DeploySessionCreateRequest,
  ): Promise<DeploySessionCreateResponse> {
    const url = `${this.baseUrl}/external-deploy/session`;
    const http = this.makeHttp(this.apiKey);
    const response = await http.postJson<DeploySessionCreateResponse>(url, request);
    if (response.statusCode !== 201) {
      throw new Error(
        `Reoclo API returned ${response.statusCode}: ${JSON.stringify(response.result)}`,
      );
    }
    if (!response.result) {
      throw new Error("Reoclo API returned empty response");
    }
    this.sessionToken = response.result.session_token;
    this.sessionId = response.result.session_id;
    return response.result;
  }

  async sync(request: DeploySyncRequest): Promise<DeploySyncResponse> {
    if (!this.sessionToken) {
      throw new Error("No session token — call createSession first");
    }
    const url = `${this.baseUrl}/external-deploy/sync`;
    const http = this.makeHttp(this.sessionToken);
    const response = await http.postJson<DeploySyncResponse>(url, request);
    if (response.statusCode !== 200) {
      throw new Error(
        `Reoclo API returned ${response.statusCode}: ${JSON.stringify(response.result)}`,
      );
    }
    if (!response.result) {
      throw new Error("Reoclo API returned empty response");
    }
    return response.result;
  }

  async revokeSession(): Promise<void> {
    if (!this.sessionToken || !this.sessionId) {
      return;
    }
    const url = `${this.baseUrl}/external-deploy/session/${this.sessionId}`;
    const http = this.makeHttp(this.sessionToken);
    try {
      // sendStream is used for DELETE; http-client has no deleteJson helper
      const response = await http.del(url);
      const statusCode = response.message.statusCode ?? 0;
      if (statusCode !== 204 && statusCode !== 200) {
        // best-effort — log but don't throw
      }
    } catch {
      // swallow — revocation is best-effort cleanup
    }
  }
}
