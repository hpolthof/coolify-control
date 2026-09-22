import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SessionUser,
  MetricHistory,
  ServerMetricPoint,
  ResourceMetricPoint,
  LogResponse,
  DeploymentInfo,
  Dashboard,
  DashboardInput,
  User,
  KioskToken,
  SystemStatus,
  ActionRequest,
  ActionResult,
  TimeRange,
  ApiError as ApiErrorType,
  ConnectorInfo,
  ConnectorToken,
} from '@cc/shared';
import { api, ApiError, onUnauthorized } from './client';

// ============ Auth ============

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<SessionUser>('/api/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<SessionUser, ApiError, { username: string; password: string }>({
    mutationFn: async ({ username, password }) =>
      api.post<SessionUser>('/api/auth/login', { username, password }),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: async () => api.post<void>('/api/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries();
    },
  });
}

export function useKioskLogin() {
  return useMutation<
    { user: SessionUser; dashboardId: number | null },
    ApiError,
    string
  >({
    mutationFn: async (token) =>
      api.post<{ user: SessionUser; dashboardId: number | null }>(
        '/api/auth/kiosk',
        { token },
      ),
  });
}

// ============ Servers ============

export function useServerHistory(
  uuid: string | undefined,
  range: TimeRange,
) {
  return useQuery({
    queryKey: ['history', 'server', uuid, range],
    queryFn: () =>
      api.get<MetricHistory<ServerMetricPoint>>(
        `/api/servers/${uuid}/metrics?range=${range}`,
      ),
    enabled: Boolean(uuid),
    refetchInterval: 30_000,
  });
}

// ============ Resources ============

export function useResourceHistory(
  uuid: string | undefined,
  range: TimeRange,
) {
  return useQuery({
    queryKey: ['history', 'resource', uuid, range],
    queryFn: () =>
      api.get<MetricHistory<ResourceMetricPoint>>(
        `/api/resources/${uuid}/metrics?range=${range}`,
      ),
    enabled: Boolean(uuid),
  });
}

export function useResourceAction() {
  return useMutation<
    ActionResult,
    ApiError,
    { uuid: string; action: ActionRequest['action']; force?: boolean }
  >({
    mutationFn: async ({ uuid, action, force }) =>
      api.post<ActionResult>(`/api/resources/${uuid}/actions`, {
        action,
        force,
      }),
  });
}

export function useLogs(
  uuid: string | undefined,
  opts: { lines: number; container?: string | null; follow?: boolean },
) {
  return useQuery({
    queryKey: ['logs', uuid, opts.container, opts.lines],
    queryFn: async () => {
      const params = new URLSearchParams({
        lines: String(opts.lines),
      });
      if (opts.container) {
        params.append('container', opts.container);
      }
      return api.get<LogResponse>(
        `/api/resources/${uuid}/logs?${params.toString()}`,
      );
    },
    enabled: Boolean(uuid),
    refetchInterval: opts.follow ? 3_000 : false,
  });
}

export function useDeployments(uuid: string | undefined) {
  return useQuery({
    queryKey: ['deployments', uuid],
    queryFn: () => api.get<DeploymentInfo[]>(`/api/resources/${uuid}/deployments`),
    enabled: Boolean(uuid),
  });
}

// ============ Dashboards ============

export function useDashboards() {
  return useQuery({
    queryKey: ['dashboards'],
    queryFn: () => api.get<Dashboard[]>('/api/dashboards'),
  });
}

export function useDashboard(id: number | undefined) {
  return useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => api.get<Dashboard>(`/api/dashboards/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation<Dashboard, ApiError, DashboardInput>({
    mutationFn: (input) => api.post<Dashboard>('/api/dashboards', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
}

export function useUpdateDashboard() {
  const queryClient = useQueryClient();
  return useMutation<
    Dashboard,
    ApiError,
    { id: number; input: Partial<DashboardInput> }
  >({
    mutationFn: ({ id, input }) =>
      api.put<Dashboard>(`/api/dashboards/${id}`, input),
    onSuccess: (data) => {
      queryClient.setQueryData(['dashboard', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => api.del(`/api/dashboards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
}

export function useReorderDashboards() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number[]>({
    mutationFn: (ids) => api.post<void>('/api/dashboards/reorder', { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
}

// ============ Users ============

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/api/users'),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<
    User,
    ApiError,
    { username: string; password: string; role: string }
  >({
    mutationFn: (data) => api.post<User>('/api/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation<User, ApiError, { id: number; password?: string; role?: string }>({
    mutationFn: ({ id, ...data }) =>
      api.patch<User>(`/api/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => api.del(`/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// ============ Kiosk Tokens ============

export function useKioskTokens() {
  return useQuery({
    queryKey: ['kiosk-tokens'],
    queryFn: () => api.get<KioskToken[]>('/api/kiosk-tokens'),
  });
}

export function useCreateKioskToken() {
  const queryClient = useQueryClient();
  return useMutation<
    KioskToken,
    ApiError,
    { name: string; dashboardId: number | null }
  >({
    mutationFn: (data) => api.post<KioskToken>('/api/kiosk-tokens', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kiosk-tokens'] });
    },
  });
}

export function useDeleteKioskToken() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => api.del(`/api/kiosk-tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kiosk-tokens'] });
    },
  });
}

// ============ System ============

export function useSystemStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<SystemStatus>('/api/status'),
    refetchInterval: 10_000,
  });
}

export function useRefresh() {
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.post<void>('/api/refresh'),
  });
}

// ============ Connector ============

export function useConnectorInfo() {
  return useQuery({
    queryKey: ['connector'],
    queryFn: () => api.get<ConnectorInfo>('/api/connector'),
    refetchInterval: 5_000,
  });
}

export function useConnectorTokens() {
  return useQuery({
    queryKey: ['connector-tokens'],
    queryFn: () => api.get<ConnectorToken[]>('/api/connector-tokens'),
  });
}

export function useCreateConnectorToken() {
  const queryClient = useQueryClient();
  return useMutation<ConnectorToken, ApiError, { name: string }>({
    mutationFn: (data) => api.post<ConnectorToken>('/api/connector-tokens', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-tokens'] });
    },
  });
}

export function useDeleteConnectorToken() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => api.del(`/api/connector-tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-tokens'] });
      queryClient.invalidateQueries({ queryKey: ['connector'] });
    },
  });
}
