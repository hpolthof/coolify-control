import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/AuthGate';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { KioskEntry } from './pages/KioskEntry';
import { ServersPage } from './features/servers/ServersPage';
import { ServerDetailPage } from './features/servers/ServerDetailPage';
import { ResourcesPage } from './features/resources/ResourcesPage';
import { DashboardsPage } from './features/dashboards/DashboardsPage';
import { SettingsPage } from './features/settings/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/kiosk/:token" element={<KioskEntry />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/servers" replace />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/servers/:uuid" element={<ServerDetailPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/dashboards/:id" element={<DashboardsPage />} />
        <Route
          path="/settings"
          element={
            <RequireAuth role="admin">
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/servers" replace />} />
      </Route>
    </Routes>
  );
}
