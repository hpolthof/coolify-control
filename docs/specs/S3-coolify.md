# S3: Coolify API client and normalisation

Coolify v4 REST API, base `${config.coolifyUrl}/api/v1`, header `Authorization: Bearer ${config.coolifyToken}`,
`Accept: application/json`. Use global `fetch` with `AbortSignal.timeout(10_000)`.

## You own
- `apps/server/src/coolify/client.ts`
- `apps/server/src/coolify/normalize.ts`
- `apps/server/test/normalize.test.ts`
(`coolify/types.ts` already exists; read it, don't edit it.)

## Exports (contract)
- `client.ts`:
  - `export class CoolifyError extends Error { constructor(public status: number, message: string) }`
  - `export function createCoolifyClient(config: Config, log: Logger): CoolifyApi` (interface in `deps.ts`).
- `normalize.ts`:
  - `export function parseCoolifyStatus(status: string | null | undefined): { state: ResourceState; health: Health }`
    following the rules in `docs/ARCHITECTURE.md` → Health rules (without the deployment/container overrides).
  - `export function buildInventory(input: InventoryInput): Inventory`
  - `export function normalizeDeployment(raw: RawCoolifyDeployment): DeploymentInfo`

## Endpoints used
| Method | Path | Notes |
|---|---|---|
| GET | `/version` | returns plain text like `4.0.0-beta.420` (may be JSON string) — strip quotes |
| GET | `/servers` | array |
| GET | `/servers/{uuid}/resources` | array of `{uuid,name,type,status}` |
| GET | `/projects` | array (no environments) |
| GET | `/projects/{uuid}` | object with `environments[]` |
| GET | `/applications` / `/services` / `/databases` | arrays |
| GET, fallback POST | `/applications/{uuid}/start\|stop\|restart`, same for `/services/…`, `/databases/…` | Coolify changed methods between versions: try GET, on 404/405 retry with POST. Start of an application: add `?force=false`. |
| GET | `/deploy?uuid={uuid}&force={bool}` | response `{ deployments: [{ message, resource_uuid, deployment_uuid }] }` |
| GET | `/deployments/applications/{uuid}?skip=0&take={n}` | `{ count, deployments: [...] }` or an array in older versions — accept both |
| GET | `/applications/{uuid}/logs?lines={n}` | `{ logs: string }` |

- If `coolifyUrl` or `coolifyToken` is empty every method rejects with `CoolifyError(0, 'Coolify is not configured (COOLIFY_URL / COOLIFY_TOKEN)')`.
- Non-2xx: read the body, use its `message` field if JSON, throw `CoolifyError(status, …)`. Network errors/timeouts →
  `CoolifyError(0, 'Cannot reach Coolify at <url>: <reason>')`. Never include the token in errors or logs.
- `action()` returns `ActionResult { ok: true, message: <Coolify message or "Restart requested">, deploymentUuid }`
  (restart/start may return `deployment_uuid`). `deploy()` returns the first deployment's uuid.
- Debug-log each request (method, path, status, ms).

## buildInventory rules
- Servers → `InventoryServer`: `isCoolifyHost` = `is_coolify_host` true, **or** `id === 0`, or ip in
  `host.docker.internal`, `127.0.0.1`, `localhost`. `coolifyReachable` = `settings.is_reachable ?? is_reachable ?? false`.
  `user` default `root`, `port` default 22.
- Environment map: from every detailed project build `envId → { projectUuid, projectName, environmentName }`.
- Server map: from `serverResources` build `resourceUuid → serverUuid`. Resource type strings: `application`, `service`,
  anything else (`standalone-postgresql`, …) is a database.
- Applications → kind `application`, `subType = build_pack`, `fqdn` (first entry if comma-separated), env via
  `environment_id`. Services → kind `service`, `subType = service_type`, `fqdn` = first sub-application with a fqdn,
  `containerHints` = own uuid + every `applications[].uuid` + `databases[].uuid`. Databases → kind `database`,
  `subType` = `database_type ?? type`, strip a leading `standalone-`.
- `serverUuid` from the server map; if absent and there is exactly one server, use that one. `serverName` from servers.
- Also add resources that appear only in `serverResources` but not in the three lists (use their type/status).
- `projects` → `ProjectSummary[]` with environments `{ name, uuid }`.
- Sort resources by projectName, environmentName, name.

## Tests
`apps/server/test/normalize.test.ts`: status parsing table (`running:healthy`, `running:unknown`, `running:unhealthy`,
`exited:unhealthy`, `exited`, `restarting:unknown`, `degraded:unhealthy`, `starting`, `''`, `undefined`) and a
`buildInventory` test with a small realistic fixture (1 coolify host + 1 remote server, 1 project with 2 environments,
2 apps, 1 service with sub-app, 1 postgres db). Run with `npx vitest run --root apps/server test/normalize.test.ts`.
