import { useState } from 'react';
import {
  useConnectorInfo,
  useConnectorTokens,
  useCreateConnectorToken,
  useDeleteConnectorToken,
  useSystemStatus,
} from '@/api/hooks';
import { Panel } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Input, Field } from '@/ui/Input';
import { StatusPill } from '@/ui/StatusPill';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/Toast';
import { formatRelative } from '@/lib/format';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import type { ConnectorToken } from '@cc/shared';

type DialogState = 'closed' | 'create' | 'delete' | 'showCommand';

interface CreateForm {
  name: string;
}

export function ConnectorPanel() {
  const { data: info, isLoading: infoLoading, isError: infoError, refetch: refetchInfo } = useConnectorInfo();
  const { data: tokens, isLoading: tokensLoading, isError: tokensError, refetch: refetchTokens } = useConnectorTokens();
  const { data: status } = useSystemStatus();
  const createMutation = useCreateConnectorToken();
  const deleteMutation = useDeleteConnectorToken();

  const [dialogState, setDialogState] = useState<DialogState>('closed');
  const [selectedToken, setSelectedToken] = useState<ConnectorToken | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: 'Coolify host' });
  const [newToken, setNewToken] = useState<string>('');
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [error, setError] = useState<string>('');

  const connectorStatus = info?.status;
  const isConnected = connectorStatus?.connected ?? false;

  const handleOpenCreateDialog = () => {
    setCreateForm({ name: 'Coolify host' });
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
      });

      if (result.token) {
        setNewToken(result.token);
        setDialogState('showCommand');
      } else {
        toast.error('No token returned from server');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create connector token');
      }
    }
  };

  const handleCopyCommand = () => {
    if (!info || !newToken) return;
    const command = `docker run -d --name coolify-control-connector --restart unless-stopped \\
  --network host \\
  -v ${info.keysDir}:/keys:ro \\
  -e CC_URL=${window.location.origin} \\
  -e CC_TOKEN=${newToken} \\
  ${info.image}`;
    navigator.clipboard.writeText(command);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  const handleOpenDeleteDialog = (token: ConnectorToken) => {
    setSelectedToken(token);
    setDialogState('delete');
  };

  const handleDeleteToken = async () => {
    if (!selectedToken) return;

    try {
      await deleteMutation.mutateAsync(selectedToken.id);
      toast.success(`Revoked connector token ${selectedToken.name}`);
      setDialogState('closed');
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Failed to revoke connector token');
      }
      setDialogState('closed');
    }
  };

  const handleTroubleshootingHints = () => {
    const hints = [];

    if (!isConnected) {
      hints.push('Start the connector on the Coolify server with the command above.');
    }

    if (connectorStatus?.lastError) {
      if (
        connectorStatus.lastError.includes('Connector not connected') ||
        connectorStatus.lastError.includes('rejected the connector token')
      ) {
        if (connectorStatus.lastError.includes('rejected')) {
          hints.push('The token was revoked or mistyped. Create a new one.');
        } else {
          hints.push('Start the connector on the Coolify server with the command above.');
        }
      }

      if (connectorStatus.lastError.includes('401')) {
        hints.push('The token was revoked or mistyped. Create a new one.');
      }

      if (connectorStatus.lastError.includes('No Coolify SSH key')) {
        hints.push('Check that /data/coolify/ssh/keys is mounted and readable (run the container as user 9999).');
      }

      if (connectorStatus.lastError.includes('cloudflared')) {
        hints.push('This server uses a Cloudflare Tunnel. Check the tunnel\'s SSH hostname in Coolify.');
      }

      if (connectorStatus.lastError.includes('timed out') || connectorStatus.lastError.includes('Cannot reach')) {
        hints.push('The Coolify server can\'t reach this server. Check that Coolify itself can.');
      }
    }

    return hints;
  };

  const troubleshootingHints = handleTroubleshootingHints();
  const showImageWarning = info?.image.includes('OWNER');

  if (infoError || tokensError) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex items-center gap-2 text-crit text-13">
            <AlertTriangle size={16} />
            <span>Couldn't load connector settings.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { refetchInfo(); refetchTokens(); }}>
            Retry
          </Button>
        </div>
      </Panel>
    );
  }

  if (infoLoading || tokensLoading || !info || !tokens) {
    return <div className="text-ink-2 text-15">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <Panel>
        <h2 className="text-18 font-semibold text-ink mb-4">Status</h2>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill
            health={isConnected ? 'healthy' : 'down'}
            label={isConnected ? 'Connected' : 'Not connected'}
          />
        </div>

        {isConnected && connectorStatus ? (
          <div className="space-y-2 text-13 text-ink-2 mb-4">
            {connectorStatus.hostname && (
              <div>
                <span className="text-ink">Hostname:</span> {connectorStatus.hostname}
              </div>
            )}
            {connectorStatus.version && (
              <div>
                <span className="text-ink">Version:</span> v{connectorStatus.version}
              </div>
            )}
            {connectorStatus.keysFound !== null && (
              <div>
                <span className="text-ink">{connectorStatus.keysFound} keys found</span>
              </div>
            )}
            {connectorStatus.cloudflared !== null && (
              <div>
                <span className="text-ink">Cloudflare Tunnel support:</span>{' '}
                {connectorStatus.cloudflared ? 'yes' : 'no'}
              </div>
            )}
            {connectorStatus.connectedAt && (
              <div>
                <span className="text-ink">Connected since:</span> {formatRelative(connectorStatus.connectedAt)}
              </div>
            )}
            {connectorStatus.lastSeenAt && (
              <div>
                <span className="text-ink">Last seen:</span> {formatRelative(connectorStatus.lastSeenAt)}
              </div>
            )}
          </div>
        ) : null}

        {!isConnected && connectorStatus?.lastError && (
          <div className="bg-sunken p-3 rounded-control text-13 text-ink-3 mb-4 font-mono break-words">
            {connectorStatus.lastError}
          </div>
        )}

        <div className="text-12 text-ink-3">
          The connector runs on your Coolify server and reaches every server with Coolify's own SSH keys.
        </div>
      </Panel>

      {/* Install */}
      <Panel>
        <h2 className="text-18 font-semibold text-ink mb-4">Install the connector</h2>

        {tokens.length === 0 ? (
          <div className="flex items-center justify-between">
            <p className="text-ink-2 text-13 flex-1">
              Create a connector token to get the installation command.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateDialog}
            >
              Create connector token
            </Button>
          </div>
        ) : newToken ? (
          <div className="space-y-4">
            {showImageWarning && (
              <div className="bg-serious/10 border border-serious/30 rounded-control p-3 text-12 text-ink-2">
                Set CONNECTOR_IMAGE on the dashboard to your published image.
              </div>
            )}

            <div className="relative">
              <div className="bg-sunken p-3 rounded-control font-mono text-ink-3 overflow-x-auto text-13 leading-relaxed whitespace-pre-wrap break-words">
                {`docker run -d --name coolify-control-connector --restart unless-stopped \\
  --network host \\
  -v ${info.keysDir}:/keys:ro \\
  -e CC_URL=${window.location.origin} \\
  -e CC_TOKEN=${newToken} \\
  ${info.image}`}
              </div>
              <button
                onClick={handleCopyCommand}
                className="absolute right-3 top-3 text-ink-3 hover:text-ink transition-colors"
                title="Copy command"
              >
                {copiedCommand ? (
                  <Check size={18} className="text-good" />
                ) : (
                  <Copy size={18} />
                )}
              </button>
            </div>

            <div className="bg-serious/10 border border-serious/30 rounded-control p-3 text-12 text-ink-2">
              Copy it now. You won't be able to see the token again.
            </div>

            <div className="text-12 text-ink-3">
              Run this on the Coolify server. The connector needs no open ports; it connects out to this dashboard.
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateDialog}
          >
            Create connector token
          </Button>
        )}
      </Panel>

      {/* Tokens Table */}
      {tokens.length > 0 && (
        <Panel>
          <h2 className="text-18 font-semibold text-ink mb-4">Tokens</h2>
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
        </Panel>
      )}

      {/* Servers Table */}
      {status?.servers && status.servers.length > 0 && (
        <Panel>
          <h2 className="text-18 font-semibold text-ink mb-4">Servers</h2>
          <div className="space-y-2">
            {status.servers.map((server) => {
              const routeLabel = server.viaCloudflare ? 'Cloudflare Tunnel' : 'Direct';
              return (
                <div
                  key={server.uuid}
                  className="flex items-start justify-between py-3 px-3 border-b border-rule/50 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-ink text-13 font-medium mb-1">{server.name}</div>
                    <div className="text-ink-3 text-12 mb-1">
                      <span className="inline-block px-2 py-1 rounded-control bg-raised text-ink-2 text-12 mr-2">
                        {routeLabel}
                      </span>
                      {server.lastPollAt && (
                        <span>
                          Last poll {formatRelative(server.lastPollAt)}
                          {server.durationMs !== null && (
                            <span className="ml-2">{server.durationMs}ms</span>
                          )}
                        </span>
                      )}
                    </div>
                    {server.error && (
                      <div className="text-ink-3 text-12 font-mono truncate mt-1">
                        <Tooltip content={server.error}>{server.error}</Tooltip>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <StatusPill
                      health={server.ok ? 'healthy' : 'down'}
                      label={server.ok ? 'Reachable' : 'Failing'}
                      size="sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Troubleshooting Hints */}
      {troubleshootingHints.length > 0 && (
        <Panel>
          <h2 className="text-18 font-semibold text-ink mb-4">Troubleshooting</h2>
          <div className="space-y-3">
            {troubleshootingHints.map((hint, idx) => (
              <div
                key={idx}
                className="bg-crit/5 p-3 rounded-control text-12 text-ink-2 border border-crit/20"
              >
                {hint}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Create Token Dialog */}
      <Dialog
        open={dialogState === 'create'}
        onClose={() => setDialogState('closed')}
        title="Create connector token"
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
              onChange={(e) => setCreateForm({ name: e.target.value })}
              placeholder="Coolify host"
              autoFocus
            />
          </Field>
        </div>
      </Dialog>

      {/* Show Command Dialog */}
      <Dialog
        open={dialogState === 'showCommand'}
        onClose={() => {
          setDialogState('closed');
          setNewToken('');
        }}
        title="Connector token created"
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
          {showImageWarning && (
            <div className="bg-serious/10 border border-serious/30 rounded-control p-3 text-12 text-ink-2">
              Set CONNECTOR_IMAGE on the dashboard to your published image.
            </div>
          )}

          <p className="text-ink-2 text-13">
            Copy it now. You won't be able to see the token again.
          </p>

          <div className="relative">
            <div className="bg-sunken p-3 rounded-control font-mono text-ink-3 overflow-x-auto text-13 leading-relaxed whitespace-pre-wrap break-words">
              {`docker run -d --name coolify-control-connector --restart unless-stopped \\
  --network host \\
  -v ${info.keysDir}:/keys:ro \\
  -e CC_URL=${window.location.origin} \\
  -e CC_TOKEN=${newToken} \\
  ${info.image}`}
            </div>
            <button
              onClick={handleCopyCommand}
              className="absolute right-3 top-3 text-ink-3 hover:text-ink transition-colors"
              title="Copy command"
            >
              {copiedCommand ? (
                <Check size={18} className="text-good" />
              ) : (
                <Copy size={18} />
              )}
            </button>
          </div>

          <div className="bg-serious/10 border border-serious/30 rounded-control p-3 text-12 text-ink-2">
            Copy it now. You won't be able to see the token again.
          </div>

          <div className="text-12 text-ink-3">
            Run this on the Coolify server. The connector needs no open ports; it connects out to this dashboard.
          </div>
        </div>
      </Dialog>

      {/* Delete Token Dialog */}
      <ConfirmDialog
        open={dialogState === 'delete'}
        title="Revoke connector token"
        message={`Revoke ${selectedToken?.name}? The connector using it disconnects immediately.`}
        confirmLabel="Revoke"
        tone="danger"
        onConfirm={handleDeleteToken}
        onClose={() => setDialogState('closed')}
      />
    </div>
  );
}
