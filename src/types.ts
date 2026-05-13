export interface DeploySessionCreateRequest {
  container_names: string[];
  workflow_run_id?: string;
  commit_sha?: string;
}

export interface DeploySessionApplicationRead {
  id: string;
  linked_container_name: string;
  container_port: number | null;
  bound_fqdns: string[];
}

export interface DeploySessionCreateResponse {
  session_id: string;
  session_token: string;
  expires_at: string;
  applications: DeploySessionApplicationRead[];
  unmatched: string[];
}

export interface DeploySyncRequestItem {
  container_name: string;
  container_port: number;
  image_tag?: string;
  force?: boolean;
}

export interface DeploySyncRequest {
  deployments: DeploySyncRequestItem[];
}

export type DeploySyncStatus = "synced" | "noop" | "conflict" | "drift_recovered";

export interface DeploySyncResponseItem {
  application_id: string;
  container_name: string;
  status: DeploySyncStatus;
  signature_hash: string;
  synced_fqdns: string[];
  reason: string | null;
}

export interface DeploySyncResponse {
  session_id: string;
  results: DeploySyncResponseItem[];
  errors: Array<{ container_name: string; reason: string }>;
}

export interface DiscoveredService {
  container_name: string;
  container_port: number;
  image_tag: string | null;
}
