import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role, SessionUser } from '@cc/shared';
import { useMe } from '@/api/hooks';
import { onUnauthorized } from '@/api/client';
import { Spinner } from '@/ui/Spinner';

interface RequireAuthProps {
  role?: Role;
  children: ReactNode;
}

// Same ranking as apps/server/src/auth/plugin.ts — keep in sync.
const RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

export function RequireAuth({ role, children }: RequireAuthProps) {
  const { data: user, isLoading } = useMe();
  const location = useLocation();

  // Subscribe to unauthorized events
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      // The query will be updated to null by the server response
    });
    return unsubscribe;
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-plane">
        <Spinner size={48} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Rank comparison: viewer < operator < admin. Kiosk sessions carry role
  // 'viewer' server-side, so they are blocked from operator/admin pages too.
  if (role && RANK[user.role] < RANK[role]) {
    return (
      <div className="flex h-screen items-center justify-center bg-plane">
        <div className="space-y-4 text-center">
          <p className="text-ink-2">You don't have access to this page.</p>
          <p className="text-13 text-ink-3">
            This page requires {role} permissions.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

export function useSession(): { user: SessionUser | null; loading: boolean } {
  const { data: user, isLoading } = useMe();
  return { user: user ?? null, loading: isLoading };
}

export function useCan(): { operate: boolean; admin: boolean } {
  const { user } = useSession();
  return {
    operate: Boolean(user && !user.kiosk && (user.role === 'operator' || user.role === 'admin')),
    admin: Boolean(user && user.role === 'admin'),
  };
}
