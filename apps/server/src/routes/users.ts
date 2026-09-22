import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';
import { HttpError } from '../app';
import { requireRole } from '../auth/plugin';
import type { Role } from '@cc/shared';

const usernameSchema = z.string().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/);
const passwordSchema = z.string().min(8);
const roleSchema = z.enum(['admin', 'operator', 'viewer']);

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema,
});

const updateUserSchema = z.object({
  password: passwordSchema.optional(),
  role: roleSchema.optional(),
});

export async function userRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const admin = requireRole('admin');

  // GET /api/users - list all users
  app.get('/api/users', { preHandler: admin }, async (req, reply) => {
    const users = deps.repos.users.list();
    reply.status(200).send(users);
  });

  // POST /api/users - create a new user
  app.post<{ Body: unknown }>('/api/users', { preHandler: admin }, async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', parsed.error.errors[0]?.message ?? 'Invalid request');
    }

    const { username, password, role } = parsed.data;

    // Check if user exists
    if (deps.repos.users.getByUsername(username)) {
      throw new HttpError(409, 'user_exists', `Username '${username}' already exists`);
    }

    const hash = await deps.auth.hashPassword(password);
    const user = deps.repos.users.create({
      username,
      passwordHash: hash,
      role,
    });

    reply.status(201).send(user);
  });

  // PATCH /api/users/:id - update a user
  app.patch<{ Params: { id: string }; Body: unknown }>('/api/users/:id', { preHandler: admin }, async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new HttpError(400, 'bad_request', 'Invalid user ID');
    }

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', parsed.error.errors[0]?.message ?? 'Invalid request');
    }

    const { password, role } = parsed.data;

    // Get the current user
    const current = deps.repos.users.getById(id);
    if (!current) {
      throw new HttpError(404, 'not_found', 'User not found');
    }

    const patch: { passwordHash?: string; role?: Role } = {};

    if (password) {
      patch.passwordHash = await deps.auth.hashPassword(password);
    }

    if (role) {
      // Check if demoting or deleting the last admin
      if (current.role === 'admin' && role !== 'admin') {
        const adminCount = deps.repos.users.list().filter((u) => u.role === 'admin').length;
        if (adminCount === 1) {
          throw new HttpError(400, 'last_admin', 'Cannot demote the last admin user');
        }
      }
      patch.role = role;
    }

    const updated = deps.repos.users.update(id, patch);
    if (!updated) {
      throw new HttpError(404, 'not_found', 'User not found');
    }

    // Delete the user's sessions if password or role changed
    if (password || role) {
      deps.repos.sessions.deleteForUser(id);
    }

    reply.status(200).send(updated);
  });

  // DELETE /api/users/:id - delete a user
  app.delete<{ Params: { id: string } }>('/api/users/:id', { preHandler: admin }, async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new HttpError(400, 'bad_request', 'Invalid user ID');
    }

    const user = deps.repos.users.getById(id);
    if (!user) {
      throw new HttpError(404, 'not_found', 'User not found');
    }

    // Check if it's the requesting user
    if (req.user?.id === id) {
      throw new HttpError(400, 'cannot_delete_self', 'Cannot delete your own user');
    }

    // Check if it's the last admin
    if (user.role === 'admin') {
      const adminCount = deps.repos.users.list().filter((u) => u.role === 'admin').length;
      if (adminCount === 1) {
        throw new HttpError(400, 'last_admin', 'Cannot delete the last admin user');
      }
    }

    const deleted = deps.repos.users.delete(id);
    if (!deleted) {
      throw new HttpError(404, 'not_found', 'User not found');
    }

    // Delete the user's sessions
    deps.repos.sessions.deleteForUser(id);

    reply.status(204).send();
  });
}
