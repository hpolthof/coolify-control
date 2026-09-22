import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useKioskLogin } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Spinner } from '@/ui/Spinner';
import { Panel } from '@/ui/Panel';

export function KioskEntry() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { mutate: login, isPending, error } = useKioskLogin();

  useEffect(() => {
    if (!token) return;
    login(token, {
      onSuccess: (data) => {
        const dashboardId = data.dashboardId;
        if (dashboardId) {
          navigate(`/dashboards/${dashboardId}?kiosk=1`, { replace: true });
        } else {
          navigate('/dashboards?kiosk=1&rotate=1', { replace: true });
        }
      },
    });
  }, [token, login, navigate]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-plane">
        <Spinner size={48} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-plane">
        <Panel className="w-full max-w-sm">
          <div className="text-center space-y-4">
            <p className="text-ink">This kiosk link is no longer valid.</p>
            <p className="text-sm text-ink-3">
              Ask an administrator for a new kiosk link.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-plane">
      <Spinner size={48} />
    </div>
  );
}
