import { useState } from 'react';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/api/hooks';
import { useSession } from '@/auth/AuthGate';
import { Panel } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Input, Field } from '@/ui/Input';
import { Select } from '@/ui/Input';
import { toast } from '@/ui/Toast';
import { formatRelative } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';
import type { Role, User } from '@cc/shared';

type DialogState = 'closed' | 'add' | 'changePassword' | 'delete';

interface AddUserForm {
  username: string;
  password: string;
  role: Role;
}

interface ChangePasswordForm {
  password: string;
  confirm: string;
}

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'operator', label: 'Operator' },
  { value: 'admin', label: 'Admin' },
];

function roleLabel(role: Role): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

export function UsersPanel() {
  const { data: users, isLoading, isError, refetch } = useUsers();
  const { user: currentUser } = useSession();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  const [dialogState, setDialogState] = useState<DialogState>('closed');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [addForm, setAddForm] = useState<AddUserForm>({
    username: '',
    password: '',
    role: 'viewer',
  });
  const [changePasswordForm, setChangePasswordForm] = useState<ChangePasswordForm>({
    password: '',
    confirm: '',
  });
  const [error, setError] = useState<string>('');

  const handleOpenAddDialog = () => {
    setAddForm({ username: '', password: '', role: 'viewer' });
    setError('');
    setDialogState('add');
  };

  const handleAddUser = async () => {
    setError('');
    if (!addForm.username.trim()) {
      setError('Username is required');
      return;
    }
    if (addForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      await createUserMutation.mutateAsync({
        username: addForm.username,
        password: addForm.password,
        role: addForm.role,
      });
      toast.success(`Added user ${addForm.username}`);
      setDialogState('closed');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create user');
      }
    }
  };

  const handleRoleChange = async (user: User, role: Role) => {
    if (role === user.role) return;
    try {
      await updateUserMutation.mutateAsync({ id: user.id, role });
      toast.success(`Changed role for ${user.username} to ${roleLabel(role)}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Failed to change role');
      }
    }
  };

  const handleOpenChangePassword = (user: User) => {
    setSelectedUser(user);
    setChangePasswordForm({ password: '', confirm: '' });
    setError('');
    setDialogState('changePassword');
  };

  const handleChangePassword = async () => {
    setError('');
    if (!selectedUser) return;

    if (changePasswordForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (changePasswordForm.password !== changePasswordForm.confirm) {
      setError('Passwords do not match');
      return;
    }

    try {
      await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        password: changePasswordForm.password,
      });
      toast.success(`Changed password for ${selectedUser.username}`);
      setDialogState('closed');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to change password');
      }
    }
  };

  const handleOpenDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setDialogState('delete');
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      await deleteUserMutation.mutateAsync(selectedUser.id);
      toast.success(`Deleted user ${selectedUser.username}`);
      setDialogState('closed');
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Failed to delete user');
      }
      setDialogState('closed');
    }
  };

  const roleHelpers = {
    viewer: 'Sees everything, changes nothing',
    operator: 'Can start, stop, restart and deploy, and edit dashboards',
    admin: 'Also manages users and kiosk links',
  };

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-18 font-semibold text-ink">Users</h2>
          <Button variant="primary" size="sm" onClick={handleOpenAddDialog}>
            Add user
          </Button>
        </div>

        {isLoading && <div className="text-ink-2 text-13 text-center py-6">Loading…</div>}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex items-center gap-2 text-crit text-13">
              <AlertTriangle size={16} />
              <span>Couldn't load users.</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && users && users.length > 0 && (
          <div className="space-y-2">
            {users.map((user) => {
              const isSelf = currentUser?.id === user.id;
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-3 px-3 border-b border-rule/50 last:border-b-0 hover:bg-raised/30 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-ink text-13 font-medium">
                      {user.username}
                      {isSelf && <span className="text-ink-3 ml-2">(you)</span>}
                    </div>
                    <div className="text-ink-2 text-12 mt-1 flex items-center gap-3">
                      {isSelf ? (
                        <span className="capitalize">{user.role}</span>
                      ) : (
                        <Select
                          value={user.role}
                          onChange={(role) => handleRoleChange(user, role as Role)}
                          options={ROLE_OPTIONS}
                          className="h-6 py-0 text-12 w-28"
                        />
                      )}
                      <span>{formatRelative(user.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenChangePassword(user)}
                    >
                      Change password
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleOpenDeleteDialog(user)}
                      disabled={isSelf}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && !isError && users && users.length === 0 && (
          <div className="text-ink-2 text-13 text-center py-6">
            No users yet. Add one to get started.
          </div>
        )}
      </Panel>

      {/* Add user dialog */}
      <Dialog
        open={dialogState === 'add'}
        onClose={() => setDialogState('closed')}
        title="Add user"
        width="md"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDialogState('closed')}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddUser}
              loading={createUserMutation.isPending}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-crit/10 border border-crit/30 rounded-control p-3 text-13 text-crit">
              {error}
            </div>
          )}
          <Field label="Username">
            <Input
              type="text"
              value={addForm.username}
              onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
              placeholder="john.doe"
              autoFocus
            />
          </Field>
          <Field label="Password (min 8 chars)">
            <Input
              type="password"
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
            />
          </Field>
          <Field label="Role" hint={roleHelpers[addForm.role]}>
            <Select
              value={addForm.role}
              onChange={(role) => setAddForm({ ...addForm, role: role as Role })}
              options={ROLE_OPTIONS}
            />
          </Field>
        </div>
      </Dialog>

      {/* Change password dialog */}
      <Dialog
        open={dialogState === 'changePassword'}
        onClose={() => setDialogState('closed')}
        title={`Change password for ${selectedUser?.username || ''}`}
        width="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDialogState('closed')}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleChangePassword}
              loading={updateUserMutation.isPending}
            >
              Update
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-crit/10 border border-crit/30 rounded-control p-3 text-13 text-crit">
              {error}
            </div>
          )}
          <Field label="New password (min 8 chars)">
            <Input
              type="password"
              value={changePasswordForm.password}
              onChange={(e) =>
                setChangePasswordForm({
                  ...changePasswordForm,
                  password: e.target.value,
                })
              }
              autoFocus
            />
          </Field>
          <Field label="Confirm password">
            <Input
              type="password"
              value={changePasswordForm.confirm}
              onChange={(e) =>
                setChangePasswordForm({
                  ...changePasswordForm,
                  confirm: e.target.value,
                })
              }
            />
          </Field>
        </div>
      </Dialog>

      {/* Delete user dialog */}
      <ConfirmDialog
        open={dialogState === 'delete'}
        title="Delete user"
        message={`Are you sure you want to delete ${selectedUser?.username}? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={handleDeleteUser}
        onClose={() => setDialogState('closed')}
      />
    </div>
  );
}
