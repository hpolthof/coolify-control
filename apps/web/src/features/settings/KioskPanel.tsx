import { useState } from 'react';
import { useKioskTokens, useCreateKioskToken, useDeleteKioskToken, useDashboards } from '@/api/hooks';
import { Panel } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Input, Field, Select } from '@/ui/Input';
import { toast } from '@/ui/Toast';
import { formatRelative } from '@/lib/format';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import type { KioskToken } from '@cc/shared';

type DialogState = 'closed' | 'create' | 'delete' | 'showToken';

interface CreateForm {
  name: string;
  dashboardId: number | null;
}

export function KioskPanel() {
  const { data: tokens, isLoading, isError, refetch } = useKioskTokens();
  const { data: dashboards } = useDashboards();
  const createMutation = useCreateKioskToken();
  const deleteMutation = useDeleteKioskToken();

  const [dialogState, setDialogState] = useState<DialogState>('closed');
  const [selectedToken, setSelectedToken] = useState<KioskToken | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({
    name: '',
    dashboardId: null,
  });
  const [newToken, setNewToken] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [error, setError] = useState<string>('');

  const handleOpenCreateDialog = () => {
    setCreateForm({ name: '', dashboardId: null });
    setError('');
    setDialogState('create');
  };

  const handleCreateToken = async () => {
    setError('');
    if (!createForm.name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        name: createForm.name,
        dashboardId: createForm.dashboardId,
      });

      if (result.token) {
        setNewToken(result.token);
        setDialogState('showToken');
      } else {
        toast.error('No token returned from server');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create kiosk link');
      }
    }
  };

  const handleCopyToken = () => {
    const url = `${location.origin}/kiosk/${newToken}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleOpenDeleteDialog = (token: KioskToken) => {
    setSelectedToken(token);
    setDialogState('delete');
  };

  const handleDeleteToken = async () => {
    if (!selectedToken) return;

    try {
      await deleteMutation.mutateAsync(selectedToken.id);
      toast.success(`Revoked kiosk link ${selectedToken.name}`);
      setDialogState('closed');
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Failed to revoke kiosk link');
      }
      setDialogState('closed');
    }
  };

  const dashboardOptions = dashboards
    ? [
        { value: 'null', label: 'Rotate through all dashboards' },
        ...dashboards.map((d) => ({
          value: String(d.id),
          label: d.name,
        })),
      ]
    : [];

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-18 font-semibold text-ink">Kiosk links</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateDialog}
          >
            Create kiosk link
          </Button>
        </div>

        <p className="text-ink-2 text-13 mb-4">
          Kiosk links open a read-only dashboard without logging in. Use them for wall screens.
        </p>

        {isLoading && <div className="text-ink-2 text-13 text-center py-6">Loading…</div>}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex items-center gap-2 text-crit text-13">
              <AlertTriangle size={16} />
              <span>Couldn't load kiosk links.</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && tokens && tokens.length > 0 && (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between py-3 px-3 border-b border-rule/50 last:border-b-0 hover:bg-raised/30 rounded"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-ink text-13 font-medium truncate">
                    {token.name}
                  </div>
                  <div className="text-ink-2 text-12 mt-1 flex gap-3">
                    <span>
                      Dashboard:{' '}
                      {token.dashboardId
                        ? dashboards?.find((d) => d.id === token.dashboardId)?.name ||
                          `#${token.dashboardId}`
                        : 'Rotate all'}
                    </span>
                    <span>Created {formatRelative(token.createdAt)}</span>
                    {token.lastUsedAt && (
                      <span>Used {formatRelative(token.lastUsedAt)}</span>
                    )}
                  </div>
                </div>

                <div className="ml-4 flex-shrink-0">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleOpenDeleteDialog(token)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && tokens && tokens.length === 0 && (
          <div className="text-ink-2 text-13 text-center py-6">
            No kiosk links yet. Create one for a wall screen.
          </div>
        )}
      </Panel>

      {/* Create dialog */}
      <Dialog
        open={dialogState === 'create'}
        onClose={() => setDialogState('closed')}
        title="Create kiosk link"
        width="md"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDialogState('closed')}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateToken}
              loading={createMutation.isPending}
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
          <Field label="Name">
            <Input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="Wall screen — office"
              autoFocus
            />
          </Field>
          <Field label="Dashboard">
            <Select
              value={createForm.dashboardId ? String(createForm.dashboardId) : 'null'}
              onChange={(value) =>
                setCreateForm({
                  ...createForm,
                  dashboardId: value === 'null' ? null : parseInt(value, 10),
                })
              }
              options={dashboardOptions}
            />
          </Field>
        </div>
      </Dialog>

      {/* Show token dialog */}
      <Dialog
        open={dialogState === 'showToken'}
        onClose={() => {
          setDialogState('closed');
          setNewToken('');
        }}
        title="Kiosk link created"
        width="md"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setDialogState('closed');
              setNewToken('');
            }}
          >
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-ink-2 text-13">
            Copy it now. You won't be able to see it again.
          </p>
          <div className="relative">
            <Input
              type="text"
              value={`${location.origin}/kiosk/${newToken}`}
              readOnly
              className="pr-10"
            />
            <button
              onClick={handleCopyToken}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink transition-colors"
              title="Copy URL"
            >
              {copiedToken ? (
                <Check size={18} className="text-good" />
              ) : (
                <Copy size={18} />
              )}
            </button>
          </div>
          <div className="bg-serious/10 border border-serious/30 rounded-control p-3 text-12 text-ink-2">
            Anyone with this link can view the dashboard on a kiosk screen. Keep it secure.
          </div>
        </div>
      </Dialog>

      {/* Delete dialog */}
      <ConfirmDialog
        open={dialogState === 'delete'}
        title="Revoke kiosk link"
        message={`Are you sure you want to revoke "${selectedToken?.name}"? Any kiosk screens using this link will stop working.`}
        confirmLabel="Revoke"
        tone="danger"
        onConfirm={handleDeleteToken}
        onClose={() => setDialogState('closed')}
      />
    </div>
  );
}
