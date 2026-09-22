import { useState } from 'react';
import { MoreHorizontal, Play, Rocket, RotateCw, ScrollText, Square } from 'lucide-react';
import type { ResourceSummary } from '@cc/shared';
import { Button, ConfirmDialog, IconButton, Menu, toast } from '@/ui';
import { useCan } from '@/auth/AuthGate';
import { useResourceAction } from '@/api/hooks';
import { useResourceDrawer } from './drawerStore';

interface ResourceActionsProps {
  resource: ResourceSummary;
  size?: 'sm' | 'md';
  variant?: 'buttons' | 'menu';
}

export function ResourceActions({ resource, size = 'md', variant = 'buttons' }: ResourceActionsProps) {
  const { operate } = useCan();
  const mutation = useResourceAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'start' | 'stop' | 'restart' | 'deploy' | null>(null);
  const [forceRebuild, setForceRebuild] = useState(false);
  const drawerStore = useResourceDrawer();

  if (!operate && variant === 'buttons') {
    // Viewers only get the Logs button
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Button
          variant="secondary"
          size={size}
          icon={ScrollText}
          onClick={() => {
            drawerStore.open(resource.uuid, 'logs');
          }}
        >
          Logs
        </Button>
      </div>
    );
  }

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'deploy') => {
    try {
      await mutation.mutateAsync({
        uuid: resource.uuid,
        action,
        force: forceRebuild,
      });
      const verb =
        action === 'start' ? 'Start requested' : action === 'stop' ? 'Stop requested' : action === 'restart' ? 'Restart requested' : 'Deploy queued';
      toast.success(`${verb} for ${resource.name}`);
      setConfirmOpen(false);
      setForceRebuild(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      toast.error(message);
    }
  };

  const openConfirm = (action: 'start' | 'stop' | 'restart' | 'deploy') => {
    setConfirmAction(action);
    setConfirmOpen(true);
  };

  type MenuItem = {
    label: string;
    icon: any;
    onSelect: () => void;
    danger?: boolean;
  };

  const menuItems: MenuItem[] = [];

  // Viewers (no operate permission) only ever get the Logs item, in both
  // the button row and the menu variant.
  if (operate) {
    if (resource.state === 'running') {
      menuItems.push(
        {
          label: 'Restart',
          icon: RotateCw,
          onSelect: () => openConfirm('restart'),
        },
        {
          label: 'Stop',
          icon: Square,
          onSelect: () => openConfirm('stop'),
          danger: true,
        },
      );
    } else if (resource.state === 'stopped' || resource.state === 'exited') {
      menuItems.push({
        label: 'Start',
        icon: Play,
        onSelect: () => handleAction('start'),
      });
    }

    if (resource.kind === 'application') {
      menuItems.push({
        label: 'Deploy',
        icon: Rocket,
        onSelect: () => openConfirm('deploy'),
      });
    }
  }

  menuItems.push({
    label: 'Logs',
    icon: ScrollText,
    onSelect: () => {
      drawerStore.open(resource.uuid, 'logs');
    },
  });

  const confirmMessages: Record<string, { title: string; message: string }> = {
    restart: {
      title: `Restart ${resource.name}?`,
      message: 'Its containers restart. Requests fail for a few seconds.',
    },
    stop: {
      title: `Stop ${resource.name}?`,
      message: 'It stays stopped until you start it again.',
    },
    deploy: {
      title: `Deploy ${resource.name}?`,
      message: '',
    },
  };

  if (variant === 'menu') {
    return (
      <>
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            trigger={<IconButton icon={MoreHorizontal} label="Actions" />}
            items={menuItems}
            align="end"
          />
        </div>
        {confirmAction && (
          <ConfirmDialog
            open={confirmOpen}
            title={confirmMessages[confirmAction].title}
            message={
              confirmAction === 'deploy' ? (
                <div className="space-y-4">
                  {confirmMessages.deploy.message && <p>{confirmMessages.deploy.message}</p>}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={forceRebuild}
                      onChange={(e) => setForceRebuild(e.target.checked)}
                      className="rounded"
                    />
                    Force rebuild (no cache)
                  </label>
                </div>
              ) : (
                confirmMessages[confirmAction].message
              )
            }
            confirmLabel={confirmAction === 'restart' ? 'Restart' : confirmAction === 'stop' ? 'Stop' : 'Deploy'}
            tone={confirmAction === 'stop' ? 'danger' : 'primary'}
            onConfirm={() => handleAction(confirmAction)}
            onClose={() => {
              setConfirmOpen(false);
              setForceRebuild(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {resource.state === 'running' && (
          <>
            <Button
              variant="secondary"
              size={size}
              icon={RotateCw}
              onClick={() => openConfirm('restart')}
            >
              Restart
            </Button>
            <Button
              variant="secondary"
              size={size}
              icon={Square}
              onClick={() => openConfirm('stop')}
            >
              Stop
            </Button>
          </>
        )}
        {(resource.state === 'stopped' || resource.state === 'exited') && (
          <Button
            variant="secondary"
            size={size}
            icon={Play}
            onClick={() => handleAction('start')}
            disabled={mutation.isPending}
          >
            Start
          </Button>
        )}
        {resource.kind === 'application' && (
          <Button
            variant="secondary"
            size={size}
            icon={Rocket}
            onClick={() => openConfirm('deploy')}
          >
            Deploy
          </Button>
        )}
        <Button
          variant="secondary"
          size={size}
          icon={ScrollText}
          onClick={() => {
            drawerStore.open(resource.uuid, 'logs');
          }}
        >
          Logs
        </Button>
      </div>

      {confirmAction && (
        <ConfirmDialog
          open={confirmOpen}
          title={confirmMessages[confirmAction].title}
          message={
            confirmAction === 'deploy' ? (
              <div className="space-y-4">
                {confirmMessages.deploy.message && <p>{confirmMessages.deploy.message}</p>}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={forceRebuild}
                    onChange={(e) => setForceRebuild(e.target.checked)}
                    className="rounded"
                  />
                  Force rebuild (no cache)
                </label>
              </div>
            ) : (
              confirmMessages[confirmAction].message
            )
          }
          confirmLabel={confirmAction === 'restart' ? 'Restart' : confirmAction === 'stop' ? 'Stop' : 'Deploy'}
          tone={confirmAction === 'stop' ? 'danger' : 'primary'}
          onConfirm={() => handleAction(confirmAction)}
          onClose={() => {
            setConfirmOpen(false);
            setForceRebuild(false);
          }}
        />
      )}
    </>
  );
}
