import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useLiveConnection } from '@/live/snapshot';
import { useKioskMode } from './useKioskMode';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ResourceDrawerHost } from '@/features/resources/ResourceDetailDrawer';

export function AppShell() {
  // Start live connection once
  useLiveConnection();

  const isKiosk = useKioskMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (isKiosk) {
    // Kiosk mode: full-screen content only, no chrome
    return (
      <div className="flex flex-col h-screen">
        <Outlet />
        <ResourceDrawerHost />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-plane">
      {/* Sidebar: icon rail on desktop, off-canvas drawer on phones */}
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (becomes the phone header, with a menu button) */}
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />

        {/* Content area */}
        <main className="flex-1 overflow-auto px-4 md:px-6 py-6">
          <Outlet />
        </main>
      </div>
      <ResourceDrawerHost />
    </div>
  );
}
