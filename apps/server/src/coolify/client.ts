import type { Logger } from 'pino';
import type { Config } from '../config';
import type { CoolifyApi } from '../deps';
import type {
  RawCoolifyApplication,
  RawCoolifyDatabase,
  RawCoolifyProject,
  RawCoolifyServer,
  RawCoolifyServerResource,
  RawCoolifyService,
} from './types';
import type { ActionResult, DeploymentInfo } from '@cc/shared';

export class CoolifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'CoolifyError';
  }
}

export function createCoolifyClient(config: Config, log: Logger): CoolifyApi {
  const configured = Boolean(config.coolifyUrl && config.coolifyToken);
  const baseUrl = config.coolifyUrl;
  const token = config.coolifyToken;

  async function request<T>(
    method: string,
    path: string,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    if (!configured) {
      throw new CoolifyError(0, 'Coolify is not configured (COOLIFY_URL / COOLIFY_TOKEN)');
    }
    const start = Date.now();
    const url = `${baseUrl}/api/v1${path}`;
    const signal = options?.signal ?? AbortSignal.timeout(10_000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal,
      });

      const ms = Date.now() - start;
      log.debug({ method, path, status: response.status, ms }, 'Coolify API request');

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          // ignore
        }
        throw new CoolifyError(response.status, message);
      }

      const text = await response.text();
      if (!text) return null as T;

      // Handle plain text responses (e.g., /version)
      if (path === '/version') {
        // Strip quotes if present
        const cleaned = text.replace(/^["']|["']$/g, '');
        return cleaned as T;
      }

      return JSON.parse(text);
    } catch (error) {
      if (error instanceof CoolifyError) throw error;
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new CoolifyError(0, `Cannot reach Coolify at ${baseUrl}: ${error.message}`);
      }
      throw new CoolifyError(0, `Cannot reach Coolify at ${baseUrl}: ${String(error)}`);
    }
  }

  async function tryMethod<T>(
    path: string,
    primaryMethod: string,
    fallbackMethod?: string
  ): Promise<T> {
    try {
      return await request<T>(primaryMethod, path);
    } catch (error) {
      if (fallbackMethod && error instanceof CoolifyError && (error.status === 404 || error.status === 405)) {
        return await request<T>(fallbackMethod, path);
      }
      throw error;
    }
  }

  const api: CoolifyApi = {
    async version() {
      return await request<string>('GET', '/version');
    },

    async listServers() {
      return await request<RawCoolifyServer[]>('GET', '/servers');
    },

    async listServerResources(serverUuid: string) {
      return await request<RawCoolifyServerResource[]>('GET', `/servers/${serverUuid}/resources`);
    },

    async listProjects() {
      return await request<RawCoolifyProject[]>('GET', '/projects');
    },

    async getProject(uuid: string) {
      return await request<RawCoolifyProject>('GET', `/projects/${uuid}`);
    },

    async listApplications() {
      return await request<RawCoolifyApplication[]>('GET', '/applications');
    },

    async listServices() {
      return await request<RawCoolifyService[]>('GET', '/services');
    },

    async listDatabases() {
      return await request<RawCoolifyDatabase[]>('GET', '/databases');
    },

    async action(kind: 'application' | 'service' | 'database', uuid: string, action: 'start' | 'stop' | 'restart') {
      let path = `/${kind}s/${uuid}/${action}`;
      if (action === 'start') {
        path += '?force=false';
      }

      try {
        const response = await tryMethod<
          | Record<string, unknown>
          | { message?: string; deployment_uuid?: string }
        >(path, 'POST', 'GET');

        let message = 'Action completed';
        let deploymentUuid: string | null = null;

        if (response && typeof response === 'object') {
          if ('message' in response && typeof response.message === 'string') {
            message = response.message;
          }
          if ('deployment_uuid' in response && typeof response.deployment_uuid === 'string') {
            deploymentUuid = response.deployment_uuid;
          }
        }

        if (!message || message === 'Action completed') {
          if (action === 'restart') message = 'Restart requested';
          else if (action === 'start') message = 'Start requested';
          else if (action === 'stop') message = 'Stop requested';
        }

        return {
          ok: true,
          message,
          deploymentUuid,
        } as ActionResult;
      } catch (error) {
        if (error instanceof CoolifyError) throw error;
        throw new CoolifyError(0, `Action ${action} failed: ${String(error)}`);
      }
    },

    async deploy(uuid: string, force: boolean) {
      const forceParam = force ? 'true' : 'false';
      const path = `/deploy?uuid=${uuid}&force=${forceParam}`;
      const response = await tryMethod<{ deployments?: Array<{ deployment_uuid?: string; uuid?: string }> }>(path, 'POST', 'GET');

      let deploymentUuid: string | null = null;
      if (response && 'deployments' in response && Array.isArray(response.deployments) && response.deployments.length > 0) {
        const dep = response.deployments[0];
        deploymentUuid = (dep.deployment_uuid || dep.uuid) ?? null;
      }

      return {
        ok: true,
        message: 'Deploy started',
        deploymentUuid,
      } as ActionResult;
    },

    async applicationDeployments(uuid: string, take: number = 10) {
      const response = await request<
        | { deployments: Array<{ deployment_uuid?: string; uuid?: string; status?: string; commit?: string | null; commit_message?: string | null; created_at?: string | null; finished_at?: string | null }> }
        | Array<{ deployment_uuid?: string; uuid?: string; status?: string; commit?: string | null; commit_message?: string | null; created_at?: string | null; finished_at?: string | null }>
      >('GET', `/deployments/applications/${uuid}?skip=0&take=${take}`);

      const deployments = Array.isArray(response) ? response : response?.deployments || [];

      return deployments.map((d) => ({
        uuid: d.deployment_uuid || d.uuid || '',
        status: d.status || '',
        commit: d.commit || null,
        commitMessage: d.commit_message || null,
        createdAt: d.created_at || null,
        finishedAt: d.finished_at || null,
      })) as DeploymentInfo[];
    },

    async applicationLogs(uuid: string, lines: number) {
      const response = await request<{ logs?: string }>('GET', `/applications/${uuid}/logs?lines=${lines}`);
      return response?.logs || '';
    },
  };

  return api;
}
