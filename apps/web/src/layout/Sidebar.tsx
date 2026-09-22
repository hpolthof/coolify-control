import { useNavigate, useLocation } from 'react-router-dom';
import { Server, Boxes, LayoutGrid, Settings, LogOut } from 'lucide-react';
import { useLogout } from '@/api/hooks';
import { useSession } from '@/auth/AuthGate';
import { IconButton } from '@/ui/Button';
import { Drawer } from '@/ui/Drawer';
import { cn } from '@/lib/cn';

interface NavItem {
  label: string;
  path: string;
  icon: typeof Server;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Servers', path: '/servers', icon: Server },
  { label: 'Resources', path: '/resources', icon: Boxes },
  { label: 'Dashboards', path: '/dashboards', icon: LayoutGrid },
  { label: 'Settings', path: '/settings', icon: Settings, adminOnly: true },
];

function isActivePath(pathname: string, path: string): boolean {
  if (path === '/servers') return pathname.startsWith('/servers');
  if (path === '/dashboards') return pathname.startsWith('/dashboards');
  return pathname.startsWith(path);
}

/** Nav buttons shared by the desktop icon rail and the mobile drawer. */
function NavLinks({
  items,
  activePath,
  onNavigate,
  showLabels,
}: {
  items: NavItem[];
  activePath: string;
  onNavigate: (path: string) => void;
  showLabels: boolean;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(activePath, item.path);
        return (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            className={cn(
              'relative flex items-center gap-3 px-3 py-2.5 rounded-control',
              'transition-colors whitespace-nowrap text-left',
              active ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink hover:bg-raised/50',
            )}
            type="button"
          >
            {active && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r" />
            )}
            <Icon size={20} className="flex-shrink-0 ml-1" />
            <span
              className={cn(
                'text-15 font-medium transition-opacity',
                showLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: logout } = useLogout();
  const { user } = useSession();

  const isAdmin = user?.role === 'admin';
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  const goTo = (path: string) => {
    navigate(path);
    onCloseMobile?.();
  };

  return (
    <>
      {/* Desktop icon rail: 64px, expands to 200px on hover */}
      <div className="hidden md:flex w-16 bg-panel border-r border-rule flex-col h-full hover:w-48 transition-all duration-200 group overflow-hidden">
        <div className="h-14 flex items-center justify-center border-b border-rule flex-shrink-0">
          <img src="/favicon.svg" alt="" className="w-6 h-6" />
        </div>

        <nav className="flex-1 overflow-y-auto flex flex-col gap-2 p-2">
          <NavLinks items={visibleItems} activePath={location.pathname} onNavigate={goTo} showLabels={false} />
        </nav>

        <div className="flex flex-col gap-2 p-2 border-t border-rule flex-shrink-0">
          <div className="px-3 py-2 text-12 opacity-0 group-hover:opacity-100 transition-opacity">
            {user && (
              <>
                <div className="font-semibold text-ink truncate">{user.username}</div>
                <div className="text-ink-3 capitalize">{user.role}</div>
              </>
            )}
          </div>
          <IconButton
            icon={LogOut}
            label="Sign out"
            onClick={handleLogout}
            size="sm"
            variant="ghost"
            className="justify-center"
          />
        </div>
      </div>

      {/* Mobile: nav lives in an off-canvas drawer, opened from TopBar's menu button */}
      <div className="md:hidden">
        <Drawer open={mobileOpen} onClose={() => onCloseMobile?.()} title="Menu" width={260} padded={false}>
          <div className="flex flex-col h-full">
            <nav className="flex-1 flex flex-col gap-1 p-3">
              <NavLinks items={visibleItems} activePath={location.pathname} onNavigate={goTo} showLabels />
            </nav>
            <div className="flex flex-col gap-2 p-3 border-t border-rule">
              {user && (
                <div className="px-1 text-13">
                  <div className="font-semibold text-ink truncate">{user.username}</div>
                  <div className="text-ink-3 capitalize">{user.role}</div>
                </div>
              )}
              <button
                onClick={handleLogout}
                type="button"
                className="flex items-center gap-2 px-3 py-2 rounded-control text-ink-2 hover:text-ink hover:bg-raised transition-colors text-15"
              >
                <LogOut size={18} />
                Sign out
              </button>
            </div>
          </div>
        </Drawer>
      </div>
    </>
  );
}
