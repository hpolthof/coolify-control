import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Dashboard, DashboardInput, WidgetType } from '@cc/shared';
import { GRID_COLS, WIDGET_DEFAULT_SIZE, WIDGET_SCALE_MAX, WIDGET_SCALE_MIN, WIDGET_TYPES } from '@cc/shared';
import type { AppDeps } from '../deps';
import { HttpError } from '../app';
import { requireRole } from '../auth/plugin';

// Generate a simple ID for widgets (12 chars, base36)
function generateWidgetId(): string {
  return randomBytes(6).toString('hex').substring(0, 12);
}

// Widget validation
const widgetConfigSchema = z.object({
  title: z.string().optional(),
  serverUuid: z.string().optional(),
  resourceUuid: z.string().optional(),
  projectUuid: z.string().optional(),
  metric: z.string().optional(),
  range: z.enum(['1h', '6h', '24h', '7d']).optional(),
  stat: z.string().optional(),
  text: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  includeStopped: z.boolean().optional(),
  scale: z.number().min(WIDGET_SCALE_MIN).max(WIDGET_SCALE_MAX).optional(),
});

const widgetSchema = z.object({
  i: z.string(),
  type: z.string(), // will validate against WidgetType
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(GRID_COLS),
  h: z.number().int().min(1).max(80),
  config: widgetConfigSchema,
});

const dashboardInputSchema = z.object({
  name: z.string().min(1).max(60),
  widgets: z.array(widgetSchema),
  position: z.number().int().min(0).optional(),
  rotationSeconds: z.number().int().min(1).nullable().optional(),
});

const VALID_WIDGET_TYPES: WidgetType[] = WIDGET_TYPES;

function validateWidgets(widgets: unknown[]): void {
  if (!Array.isArray(widgets)) {
    throw new HttpError(400, 'bad_request', 'Widgets must be an array');
  }

  if (widgets.length > 100) {
    throw new HttpError(400, 'bad_request', 'Maximum 100 widgets per dashboard');
  }

  for (const widget of widgets) {
    if (typeof widget !== 'object' || widget === null) {
      throw new HttpError(400, 'bad_request', 'Invalid widget');
    }

    const w = widget as Record<string, unknown>;

    // Validate widget type
    if (typeof w.type !== 'string' || !VALID_WIDGET_TYPES.includes(w.type as WidgetType)) {
      throw new HttpError(400, 'bad_request', `Invalid widget type: ${w.type}`);
    }

    // Validate position and size
    if (typeof w.x !== 'number' || typeof w.y !== 'number' || typeof w.w !== 'number' || typeof w.h !== 'number') {
      throw new HttpError(400, 'bad_request', 'Widget position and size must be numbers');
    }

    if (w.x < 0 || w.y < 0 || (w.w as number) < 1 || (w.w as number) > GRID_COLS || (w.h as number) < 1 || (w.h as number) > 80) {
      throw new HttpError(400, 'bad_request', 'Widget position/size out of bounds');
    }
  }
}

function createDefaultDashboard(snapshot: { servers: unknown[] }): DashboardInput {
  const widgets: Dashboard['widgets'] = [];

  // Add overview widget at top
  widgets.push({
    i: generateWidgetId(),
    type: 'overview',
    x: 0,
    y: 0,
    w: GRID_COLS,
    h: WIDGET_DEFAULT_SIZE.overview.h,
    config: {},
  });

  // Add server widgets, side by side, wrapping into rows
  let y = WIDGET_DEFAULT_SIZE.overview.h;
  let x = 0;
  for (let i = 0; i < (snapshot.servers as unknown[]).length; i++) {
    const server = (snapshot.servers as Record<string, unknown>[])[i];
    const defaultSize = WIDGET_DEFAULT_SIZE.server;

    widgets.push({
      i: generateWidgetId(),
      type: 'server',
      x,
      y,
      w: defaultSize.w,
      h: defaultSize.h,
      config: { serverUuid: (server as Record<string, unknown>).uuid as string },
    });

    x += defaultSize.w;
    if (x + defaultSize.w > GRID_COLS) {
      x = 0;
      y += defaultSize.h;
    }
  }

  return {
    name: 'Overview',
    widgets,
  };
}

export async function dashboardRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // POST /api/dashboards/reorder - must come before /:id routes
  app.post('/api/dashboards/reorder', { preHandler: requireRole('operator') }, async (req, reply) => {
    const schema = z.object({
      ids: z.array(z.number().int().positive()),
    });

    const bodyResult = schema.safeParse(req.body);
    if (!bodyResult.success) {
      throw new HttpError(400, 'bad_request', bodyResult.error.message);
    }

    const { ids } = bodyResult.data;

    deps.repos.dashboards.reorder(ids);
    reply.status(204).send();
  });

  // GET /api/dashboards
  app.get('/api/dashboards', { preHandler: requireRole('viewer') }, async (req, reply) => {
    let dashboards = deps.repos.dashboards.list();

    // Lazy seed: if no dashboards exist and there are servers, create default
    if (dashboards.length === 0) {
      const snapshot = deps.state.get();
      if (snapshot.servers.length > 0) {
        const defaultInput = createDefaultDashboard(snapshot);
        const created = deps.repos.dashboards.create(defaultInput);
        dashboards = [created];
      }
    }

    reply.send(dashboards);
  });

  // GET /api/dashboards/:id
  app.get(
    '/api/dashboards/:id',
    { preHandler: requireRole('viewer') },
    async (req, reply) => {
      const id = parseInt((req.params as Record<string, unknown>).id as string, 10);
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'bad_request', 'Invalid dashboard ID');
      }

      const dashboard = deps.repos.dashboards.get(id);
      if (!dashboard) {
        throw new HttpError(404, 'not_found', 'Dashboard not found');
      }

      reply.send(dashboard);
    },
  );

  // POST /api/dashboards
  app.post('/api/dashboards', { preHandler: requireRole('operator') }, async (req, reply) => {
    const bodyResult = dashboardInputSchema.safeParse(req.body);
    if (!bodyResult.success) {
      throw new HttpError(400, 'bad_request', bodyResult.error.message);
    }

    const input = bodyResult.data as DashboardInput;

    // Additional validation for widgets
    validateWidgets(input.widgets);

    const dashboard = deps.repos.dashboards.create(input);
    reply.status(201).send(dashboard);
  });

  // PUT /api/dashboards/:id
  app.put(
    '/api/dashboards/:id',
    { preHandler: requireRole('operator') },
    async (req, reply) => {
      const id = parseInt((req.params as Record<string, unknown>).id as string, 10);
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'bad_request', 'Invalid dashboard ID');
      }

      // Validate input is partial
      const inputSchema = dashboardInputSchema.partial();
      const bodyResult = inputSchema.safeParse(req.body);
      if (!bodyResult.success) {
        throw new HttpError(400, 'bad_request', bodyResult.error.message);
      }

      const input = bodyResult.data as Partial<DashboardInput>;

      // Validate widgets if provided
      if (input.widgets) {
        validateWidgets(input.widgets);
      }

      const dashboard = deps.repos.dashboards.update(id, input);
      if (!dashboard) {
        throw new HttpError(404, 'not_found', 'Dashboard not found');
      }

      reply.send(dashboard);
    },
  );

  // DELETE /api/dashboards/:id
  app.delete(
    '/api/dashboards/:id',
    { preHandler: requireRole('operator') },
    async (req, reply) => {
      const id = parseInt((req.params as Record<string, unknown>).id as string, 10);
      if (!Number.isFinite(id) || id <= 0) {
        throw new HttpError(400, 'bad_request', 'Invalid dashboard ID');
      }

      const deleted = deps.repos.dashboards.delete(id);
      if (!deleted) {
        throw new HttpError(404, 'not_found', 'Dashboard not found');
      }

      reply.status(204).send();
    },
  );
}
