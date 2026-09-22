import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import type { Dashboard, Widget, WidgetType } from '@cc/shared';
import { WIDGET_DEFAULT_SIZE } from '@cc/shared';
import { WIDGET_FIELDS } from './widgets/registry';
import { useDashboards, useUpdateDashboard, useReorderDashboards, useDeleteDashboard, useCreateDashboard } from '@/api/hooks';
import { useCan, useSession } from '@/auth/AuthGate';
import { useKioskMode } from '@/layout/useKioskMode';
import { useFullscreen } from '@/layout/useFullscreen';
import { EmptyState } from '@/ui/EmptyState';
import { Button } from '@/ui/Button';
import { toast } from '@/ui/Toast';
import { DashboardTabs } from './DashboardTabs';
import { DashboardGrid } from './DashboardGrid';
import { WidgetPicker } from './WidgetPicker';
import { WidgetConfigDialog } from './WidgetConfigDialog';
import { KioskStrip } from './KioskStrip';
import { newWidgetId, findFreeSpot } from './dashboardUtils';
import { useConnectionState } from '@/live/snapshot';
import { useServers } from '@/live/snapshot';

export function DashboardsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: dashboardIdParam } = useParams<{ id?: string }>();
  const { operate } = useCan();
  const { user } = useSession();
  const isKioskSession = Boolean(user?.kiosk);
  const kioskMode = useKioskMode();
  const kioskZoom = useKioskZoom(kioskMode);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const searchParams = new URLSearchParams(location.search);
  const shouldRotate = kioskMode && (searchParams.get('rotate') === '1' || !dashboardIdParam);

  const dashboardsQuery = useDashboards();
  const dashboards = dashboardsQuery.data ?? [];
  const updateDashboardMutation = useUpdateDashboard();
  const reorderMutation = useReorderDashboards();
  const deleteMutation = useDeleteDashboard();
  const createMutation = useCreateDashboard();

  const connectionState = useConnectionState();
  const servers = useServers();

  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(
    null
  );
  const [editing, setEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configWidget, setConfigWidget] = useState<Widget | null>(null);
  const [configType, setConfigType] = useState<WidgetType | null>(null);
  // When the current dashboard started showing in rotation; reset whenever the active dashboard changes.
  const [rotationStartedAt, setRotationStartedAt] = useState(() => Date.now());

  // Handle beforeunload for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Initialize active dashboard
  useEffect(() => {
    if (dashboards.length === 0) return;

    let dashboard: Dashboard | null = null;

    if (dashboardIdParam) {
      dashboard =
        dashboards.find(d => d.id === parseInt(dashboardIdParam, 10)) ??
        dashboards[0];
    } else {
      dashboard = dashboards[0];
    }

    if (!dashboard) return;

    if (activeDashboard?.id !== dashboard.id) {
      setActiveDashboard(dashboard);
      setWidgets(dashboard.widgets);
      setEditing(false);
      setHasUnsavedChanges(false);
    }

    // Only navigate when the URL isn't already pointing at this dashboard,
    // and always preserve the existing query string (kiosk/rotate params).
    if (dashboardIdParam !== String(dashboard.id)) {
      navigate(`/dashboards/${dashboard.id}${location.search}`, { replace: true });
    }
  }, [dashboards, dashboardIdParam, navigate, activeDashboard?.id, location.search]);

  // Kiosk rotation: dashboards with rotationSeconds take turns, starting from the one on screen.
  const rotatingDashboards = dashboards.filter((d) => d.rotationSeconds);
  const rotationActive = shouldRotate && rotatingDashboards.length > 1;
  const rotationIndex = rotatingDashboards.findIndex((d) => d.id === activeDashboard?.id);
  const nextRotationDashboard = rotationActive
    ? rotatingDashboards[(rotationIndex + 1) % rotatingDashboards.length]
    : undefined;
  const rotationMs = (activeDashboard?.rotationSeconds ?? 60) * 1000;

  useEffect(() => {
    setRotationStartedAt(Date.now());
  }, [activeDashboard?.id]);

  useEffect(() => {
    if (!rotationActive || !nextRotationDashboard) return;
    const timer = setTimeout(
      () => navigate(`/dashboards/${nextRotationDashboard.id}?kiosk=1&rotate=1`, { replace: true }),
      Math.max(0, rotationStartedAt + rotationMs - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [rotationActive, nextRotationDashboard, rotationStartedAt, rotationMs, navigate]);

  // Esc exits kiosk mode entered via ?kiosk=1 (not for a real kiosk session).
  useEffect(() => {
    if (!kioskMode || isKioskSession) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isFullscreen) toggleFullscreen();
      navigate(activeDashboard ? `/dashboards/${activeDashboard.id}` : '/dashboards', {
        replace: true,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kioskMode, isKioskSession, isFullscreen, toggleFullscreen, navigate, activeDashboard]);

  // Hide the mouse cursor after 3s of inactivity in kiosk mode.
  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    if (!kioskMode) {
      setCursorHidden(false);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setCursorHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setCursorHidden(true), 3000);
    };

    reset();
    window.addEventListener('mousemove', reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
    };
  }, [kioskMode]);

  const handleSelectDashboard = (d: Dashboard) => {
    if (editing && hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Do you want to discard them?'
      );
      if (!confirmed) return;
    }
    navigate(`/dashboards/${d.id}`);
  };

  const handleWidgetChange = (newWidgets: Widget[]) => {
    setWidgets(newWidgets);
    setHasUnsavedChanges(true);
  };

  const handleSaveLayout = async () => {
    if (!activeDashboard) return;

    await updateDashboardMutation.mutateAsync({
      id: activeDashboard.id,
      input: { widgets },
    });

    setEditing(false);
    setHasUnsavedChanges(false);
    toast.success('Layout saved');
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to discard them?'
      );
      if (!confirmed) return;
    }
    setWidgets(activeDashboard?.widgets ?? []);
    setEditing(false);
    setHasUnsavedChanges(false);
  };

  const handleAddWidget = async (type: WidgetType) => {
    if (!activeDashboard) return;

    setPickerOpen(false);

    const newWidget: Widget = {
      i: newWidgetId(),
      type,
      ...findFreeSpot(widgets, WIDGET_DEFAULT_SIZE[type].w, WIDGET_DEFAULT_SIZE[type].h),
      w: WIDGET_DEFAULT_SIZE[type].w,
      h: WIDGET_DEFAULT_SIZE[type].h,
      config: {},
    };

    // Require config for widgets that need it
    const needsConfig = ['server', 'resource', 'project', 'serverMetric', 'resourceMetric', 'stat', 'text'].some(
      field => WIDGET_FIELDS[type]?.includes(field as any)
    );

    if (needsConfig) {
      setConfigWidget(newWidget);
      setConfigType(type);
      setConfigDialogOpen(true);
    } else {
      const updated = [...widgets, newWidget];
      handleWidgetChange(updated);
      setEditing(true);
    }
  };

  const handleConfigureWidget = (widget: Widget) => {
    setConfigWidget(widget);
    setConfigType(widget.type);
    setConfigDialogOpen(true);
  };

  const handleRemoveWidget = (i: string) => {
    const updated = widgets.filter(w => w.i !== i);
    handleWidgetChange(updated);
  };

  const handleSaveConfig = (widget: Widget) => {
    const existing = widgets.find(w => w.i === widget.i);
    if (existing) {
      const updated = widgets.map(w => (w.i === widget.i ? widget : w));
      handleWidgetChange(updated);
    } else {
      const updated = [...widgets, widget];
      handleWidgetChange(updated);
      setEditing(true);
    }
    setConfigDialogOpen(false);
    setConfigWidget(null);
    setConfigType(null);
  };

  const handleKiosk = () => {
    toggleFullscreen();
    navigate(`/dashboards/${activeDashboard?.id}?kiosk=1`, { replace: true });
  };

  const handleCreateDashboard = async (name?: string) => {
    await createMutation.mutateAsync({
      name: name?.trim() || 'New dashboard',
      widgets: [],
    });
    toast.success('Dashboard created');
  };

  const handleRenameDashboard = async (id: number, name: string) => {
    await updateDashboardMutation.mutateAsync({
      id,
      input: { name },
    });
    toast.success('Dashboard renamed');
  };

  const handleDuplicateDashboard = async (id: number) => {
    const dashboard = dashboards.find(d => d.id === id);
    if (!dashboard) return;

    await createMutation.mutateAsync({
      name: `${dashboard.name} (copy)`,
      widgets: dashboard.widgets,
    });
    toast.success('Dashboard duplicated');
  };

  const handleRotationChange = async (id: number, seconds: number | null) => {
    await updateDashboardMutation.mutateAsync({
      id,
      input: { rotationSeconds: seconds },
    });
    toast.success('Rotation settings saved');
  };

  const handleReorderMove = async (id: number, direction: 'left' | 'right') => {
    const index = dashboards.findIndex(d => d.id === id);
    if (index === -1) return;

    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= dashboards.length) return;

    const newIds = dashboards.map(d => d.id);
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];

    await reorderMutation.mutateAsync(newIds);
  };

  const handleDeleteDashboard = async (id: number) => {
    await deleteMutation.mutateAsync(id);
    toast.success('Dashboard deleted');
  };

  if (dashboards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={LayoutGrid}
          title="No dashboards yet"
          body="Create one to pin servers and resources."
          action={
            operate ? (
              <Button onClick={() => handleCreateDashboard()}>
                Create dashboard
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (!activeDashboard) {
    return <div className="flex-1" />;
  }


  return (
    <div className={`contents ${cursorHidden ? 'cursor-none' : ''}`}>
      {!kioskMode && (
        <DashboardTabs
          dashboards={dashboards}
          activeDashboard={activeDashboard}
          editing={editing}
          hasUnsavedChanges={hasUnsavedChanges}
          onSelectDashboard={handleSelectDashboard}
          onCreate={handleCreateDashboard}
          onEditMode={setEditing}
          onSave={handleSaveLayout}
          onCancel={handleCancel}
          onKiosk={handleKiosk}
          onRename={handleRenameDashboard}
          onDuplicate={handleDuplicateDashboard}
          onRotationChange={handleRotationChange}
          onReorderMove={handleReorderMove}
          onDelete={handleDeleteDashboard}
        />
      )}

      <div className="flex-1 overflow-auto" style={kioskMode ? { paddingBottom: 32 * kioskZoom } : undefined}>
        <div className={kioskMode ? 'p-4' : 'p-6'} style={kioskMode ? { zoom: kioskZoom } : undefined}>
          {editing && operate && (
            <div className="mb-4 flex gap-2">
              <Button variant="primary" onClick={() => setPickerOpen(true)}>
                Add widget
              </Button>
            </div>
          )}

          <DashboardGrid
            dashboard={activeDashboard}
            widgets={widgets}
            editing={editing}
            onChange={handleWidgetChange}
            onConfigure={handleConfigureWidget}
            onRemove={handleRemoveWidget}
          />
        </div>
      </div>

      {kioskMode && (
        <KioskStrip
          dashboardName={activeDashboard.name}
          isLive={connectionState === 'live'}
          zoom={kioskZoom}
          rotation={
            nextRotationDashboard
              ? { startedAt: rotationStartedAt, durationMs: rotationMs, nextName: nextRotationDashboard.name }
              : undefined
          }
        />
      )}

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectType={handleAddWidget}
        onQuickAddServers={async () => {
          setPickerOpen(false);
          const newWidgets = servers.map((server, index) => ({
            i: newWidgetId(),
            type: 'server' as const,
            x: (index % 3) * 4,
            y: Math.floor(index / 3) * 7,
            w: 4,
            h: 7,
            config: { serverUuid: server.uuid },
          }));
          const updated = [...widgets, ...newWidgets];
          handleWidgetChange(updated);
          setEditing(true);
        }}
        onQuickAddProject={() => {
          setPickerOpen(false);
          setConfigWidget({
            i: newWidgetId(),
            type: 'project',
            ...findFreeSpot(widgets, 4, 6),
            w: 4,
            h: 6,
            config: {},
          });
          setConfigType('project');
          setConfigDialogOpen(true);
        }}
      />

      <WidgetConfigDialog
        key={configWidget?.i ?? configType ?? 'none'}
        open={configDialogOpen}
        widget={configWidget}
        type={configType}
        isExisting={configWidget ? widgets.some(w => w.i === configWidget.i) : false}
        onClose={() => {
          setConfigDialogOpen(false);
          setConfigWidget(null);
          setConfigType(null);
        }}
        onSave={handleSaveConfig}
      />
    </div>
  );
}

/** Scale kiosk dashboards with the screen: 1920px wide = 1×, a 4K TV = 2×. */
function useKioskZoom(enabled: boolean): number {
  const compute = () => Math.min(2.5, Math.max(1, window.innerWidth / 1920));
  const [zoom, setZoom] = useState(compute);
  useEffect(() => {
    if (!enabled) return;
    const onResize = () => setZoom(compute());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled]);
  return zoom;
}
