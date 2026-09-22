import type { Dashboard } from '@cc/shared';
import { Plus, Tv, Edit2, X, Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useCan } from '@/auth/AuthGate';
import { Button, IconButton } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Dialog } from '@/ui/Dialog';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Menu } from '@/ui/Menu';
import { useState } from 'react';

interface DashboardTabsProps {
  dashboards: Dashboard[];
  activeDashboard: Dashboard;
  editing: boolean;
  hasUnsavedChanges: boolean;
  onSelectDashboard(d: Dashboard): void;
  onCreate(name: string): void;
  onEditMode(enable: boolean): void;
  onSave(): void;
  onCancel(): void;
  onKiosk(): void;
  onRename(id: number, name: string): void;
  onDuplicate(id: number): void;
  onRotationChange(id: number, seconds: number | null): void;
  onReorderMove(id: number, direction: 'left' | 'right'): void;
  onDelete(id: number): void;
}

export function DashboardTabs({
  dashboards,
  activeDashboard,
  editing,
  hasUnsavedChanges,
  onSelectDashboard,
  onCreate,
  onEditMode,
  onSave,
  onCancel,
  onKiosk,
  onRename,
  onDuplicate,
  onRotationChange,
  onReorderMove,
  onDelete,
}: DashboardTabsProps) {
  const { operate } = useCan();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameId, setRenameId] = useState<number | null>(null);
  const [rotationDialogOpen, setRotationDialogOpen] = useState(false);
  const [rotationId, setRotationId] = useState<number | null>(null);
  const [rotationSeconds, setRotationSeconds] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleCreateNew = () => {
    if (newName.trim()) {
      onCreate(newName.trim());
      setNewName('');
      setCreateDialogOpen(false);
    }
  };

  const handleRename = () => {
    if (renameName.trim() && renameId) {
      onRename(renameId, renameName);
      setRenameDialogOpen(false);
      setRenameName('');
      setRenameId(null);
    }
  };

  const handleRotationChange = () => {
    if (rotationId) {
      onRotationChange(rotationId, rotationSeconds);
      setRotationDialogOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-4 border-b border-rule px-4 py-0">
      <div className="flex items-center gap-1 overflow-x-auto flex-1">
        {dashboards.map(d => (
          <button
            key={d.id}
            onClick={() => onSelectDashboard(d)}
            className={`px-3 py-3 text-15 font-medium relative whitespace-nowrap transition-colors ${
              activeDashboard.id === d.id
                ? 'text-accent'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {d.name}
            {activeDashboard.id === d.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {operate && (
        <button
          onClick={() => setCreateDialogOpen(true)}
          className="p-2 rounded-control hover:bg-raised transition-colors flex-shrink-0"
          title="Create dashboard"
        >
          <Plus size={20} />
        </button>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onKiosk}
          className="p-2 rounded-control hover:bg-raised transition-colors flex-shrink-0"
          title="Kiosk mode"
        >
          <Tv size={20} />
        </button>

        {operate && (
          <>
            {!editing ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEditMode(true)}
              >
                <Edit2 size={16} />
                Edit layout
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSave}
                  disabled={!hasUnsavedChanges}
                >
                  Save layout
                </Button>
              </>
            )}

            {!editing && (
              <Menu
                trigger={
                  <button
                    className="p-2 rounded-control hover:bg-raised transition-colors"
                    title="Menu"
                  >
                    ⋮
                  </button>
                }
                items={[
                  {
                    label: 'Rename',
                    onSelect: () => {
                      setRenameName(activeDashboard.name);
                      setRenameId(activeDashboard.id);
                      setRenameDialogOpen(true);
                    },
                  },
                  {
                    label: 'Duplicate',
                    onSelect: () => onDuplicate(activeDashboard.id),
                  },
                  {
                    label: 'Rotation settings',
                    onSelect: () => {
                      setRotationId(activeDashboard.id);
                      setRotationSeconds(activeDashboard.rotationSeconds);
                      setRotationDialogOpen(true);
                    },
                  },
                  {
                    label: 'Move left',
                    onSelect: () => onReorderMove(activeDashboard.id, 'left'),
                    disabled: activeDashboard.position === 0,
                  },
                  {
                    label: 'Move right',
                    onSelect: () => onReorderMove(activeDashboard.id, 'right'),
                    disabled:
                      activeDashboard.position === dashboards.length - 1,
                  },
                  {
                    label: 'Delete',
                    danger: true,
                    onSelect: () => {
                      setDeleteId(activeDashboard.id);
                      setDeleteConfirmOpen(true);
                    },
                    disabled: dashboards.length <= 1,
                  },
                ]}
              />
            )}
          </>
        )}
      </div>

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create dashboard"
        width="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateNew}
              disabled={!newName.trim()}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            placeholder="Dashboard name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
          />
        </div>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        title="Rename dashboard"
        width="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setRenameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRename}
              disabled={!renameName.trim()}
            >
              Rename
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            placeholder="Dashboard name"
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            autoFocus
          />
        </div>
      </Dialog>

      <Dialog
        open={rotationDialogOpen}
        onClose={() => setRotationDialogOpen(false)}
        title="Rotation settings"
        width="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setRotationDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRotationChange}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-13 text-ink-2 mb-2">
              Rotation dwell time (seconds)
            </label>
            <Input
              type="number"
              placeholder="60"
              value={rotationSeconds ?? ''}
              onChange={e => {
                const val = e.target.value;
                setRotationSeconds(val ? parseInt(val, 10) : null);
              }}
            />
            <p className="text-12 text-ink-3 mt-2">
              Leave empty to skip this dashboard in rotation
            </p>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete dashboard"
        message={`Are you sure you want to delete "${activeDashboard.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          if (deleteId) onDelete(deleteId);
          setDeleteConfirmOpen(false);
          setDeleteId(null);
        }}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
