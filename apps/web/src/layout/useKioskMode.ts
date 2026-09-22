import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '@/auth/AuthGate';

export function useKioskMode(): boolean {
  const [searchParams] = useSearchParams();
  const { user } = useSession();

  return useMemo(() => {
    return user?.kiosk || searchParams.get('kiosk') === '1';
  }, [user?.kiosk, searchParams]);
}
