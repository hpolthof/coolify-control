// Loose shapes of Coolify v4 API responses (/api/v1). Coolify versions differ,
// so every field is optional and unknown fields are allowed. Normalise in
// coolify/normalize.ts, never use these types outside the coolify + poller modules.

type Loose = { [key: string]: unknown };

export interface RawCoolifyServer extends Loose {
  id?: number;
  uuid: string;
  name: string;
  description?: string | null;
  ip: string;
  user?: string;
  port?: number;
  is_coolify_host?: boolean;
  is_reachable?: boolean;
  is_usable?: boolean;
  settings?: { is_reachable?: boolean; is_usable?: boolean; is_cloudflare_tunnel?: boolean } & Loose;
}

export interface RawCoolifyServerResource extends Loose {
  id?: number;
  uuid: string;
  name: string;
  type?: string; // 'application' | 'service' | 'standalone-postgresql' | ...
  status?: string;
}

export interface RawCoolifyEnvironment extends Loose {
  id?: number;
  uuid?: string;
  name: string;
  project_id?: number;
}

export interface RawCoolifyProject extends Loose {
  id?: number;
  uuid: string;
  name: string;
  description?: string | null;
  environments?: RawCoolifyEnvironment[];
}

export interface RawCoolifyApplication extends Loose {
  uuid: string;
  name: string;
  description?: string | null;
  fqdn?: string | null;
  status?: string; // "running:healthy", "exited:unhealthy", "running:unknown", ...
  build_pack?: string;
  environment_id?: number;
  destination_id?: number;
  git_repository?: string | null;
  git_branch?: string | null;
  git_commit_sha?: string | null;
  last_online_at?: string | null;
  updated_at?: string | null;
}

export interface RawCoolifyService extends Loose {
  uuid: string;
  name: string;
  description?: string | null;
  status?: string;
  service_type?: string | null;
  environment_id?: number;
  server_id?: number;
  applications?: (Loose & { uuid?: string; name?: string; fqdn?: string | null; status?: string })[];
  databases?: (Loose & { uuid?: string; name?: string; status?: string })[];
  updated_at?: string | null;
}

export interface RawCoolifyDatabase extends Loose {
  uuid: string;
  name: string;
  description?: string | null;
  status?: string;
  database_type?: string; // standalone-postgresql, ...
  type?: string;
  environment_id?: number;
  destination_id?: number;
  updated_at?: string | null;
}

export interface RawCoolifyDeployment extends Loose {
  deployment_uuid?: string;
  uuid?: string;
  status?: string;
  commit?: string | null;
  commit_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  finished_at?: string | null;
}

// ---------- Normalised inventory (output of coolify/normalize.ts buildInventory) ----------

import type { DeploymentInfo, ProjectSummary, ResourceKind } from '@cc/shared';

export interface InventoryServer {
  uuid: string;
  name: string;
  description: string | null;
  ip: string;
  user: string;
  port: number;
  isCoolifyHost: boolean;
  viaCloudflare: boolean;
  coolifyReachable: boolean;
}

export interface InventoryResource {
  uuid: string;
  name: string;
  kind: ResourceKind;
  subType: string | null;
  description: string | null;
  status: string; // raw Coolify status
  fqdn: string | null;
  projectUuid: string | null;
  projectName: string | null;
  environmentName: string | null;
  serverUuid: string | null;
  serverName: string | null;
  updatedAt: string | null;
  // Strings a container name may contain for this resource: the resource uuid, plus for services
  // the uuids of their sub-applications and sub-databases.
  containerHints: string[];
  lastDeployment: DeploymentInfo | null; // filled by the poller, buildInventory sets null
}

export interface Inventory {
  version: string | null;
  fetchedAt: string; // ISO
  servers: InventoryServer[];
  resources: InventoryResource[];
  projects: ProjectSummary[];
}

export interface InventoryInput {
  version: string | null;
  servers: RawCoolifyServer[];
  serverResources: Record<string, RawCoolifyServerResource[]>; // by server uuid
  projects: RawCoolifyProject[]; // detailed (GET /projects/{uuid}) so environments are present
  applications: RawCoolifyApplication[];
  services: RawCoolifyService[];
  databases: RawCoolifyDatabase[];
}
