import type { DeploySessionCreateRequest, DeploySessionCreateResponse, DeploySyncRequest, DeploySyncResponse } from "./types.js";
export declare class ReocloClient {
    private baseUrl;
    private apiKey;
    private sessionToken;
    private sessionId;
    constructor(apiKey: string, apiUrl: string);
    private makeHttp;
    createSession(request: DeploySessionCreateRequest): Promise<DeploySessionCreateResponse>;
    sync(request: DeploySyncRequest): Promise<DeploySyncResponse>;
    revokeSession(): Promise<void>;
}
