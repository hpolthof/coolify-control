import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useLogin, useMe } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Panel } from '@/ui/Panel';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user, isLoading: meLoading } = useMe();
  const { mutate: login, isPending, error, reset } = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (!meLoading && user) {
      navigate('/', { replace: true });
    }
  }, [user, meLoading, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    login(
      { username, password },
      {
        onSuccess: () => {
          const from = (location.state?.from?.pathname) || '/';
          navigate(from, { replace: true });
        },
      },
    );
  };

  const getErrorMessage = (): string | null => {
    if (!error) return null;
    if (error instanceof ApiError) {
      if (error.code === 'invalid_credentials') {
        return 'Wrong username or password.';
      }
      if (error.code === 'too_many_attempts') {
        return 'Too many attempts. Try again in a few minutes.';
      }
    }
    return error?.message || 'Sign in failed.';
  };

  const errorMessage = getErrorMessage();

  return (
    <div className="flex h-screen items-center justify-center bg-plane">
      <Panel className="w-full max-w-sm mx-4">
        <div className="space-y-6">
          <div>
            <h1 className="text-28 font-semibold text-ink">Coolify Control</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isPending}
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                autoComplete="current-password"
              />
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 text-13 text-crit">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={isPending || !username || !password}
              loading={isPending}
              className="w-full"
            >
              Sign in
            </Button>
          </form>
        </div>
      </Panel>
    </div>
  );
}
