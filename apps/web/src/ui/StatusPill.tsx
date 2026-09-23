import { cn } from '@/lib/cn';
import { healthLabel, healthToken, stateLabel, statusTextClass } from '@/lib/health';
import type { Health, ResourceState } from '@cc/shared';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  XCircle,
} from 'lucide-react';

interface StatusPillProps {
  health: Health;
  label?: string;
  state?: ResourceState;
  size?: 'sm' | 'md';
}

export function StatusPill({ health, label, state, size = 'md' }: StatusPillProps) {
  const statusToken = healthToken(health);
  const displayLabel = state != null ? stateLabel(state) : (label ?? healthLabel(health));
  const iconSize = size === 'sm' ? 16 : 18;

  let icon = null;
  switch (health) {
    case 'healthy':
      icon = <CheckCircle2 size={iconSize} />;
      break;
    case 'degraded':
      icon = <AlertTriangle size={iconSize} />;
      break;
    case 'down':
      icon = <XCircle size={iconSize} />;
      break;
    case 'unknown':
      icon = <HelpCircle size={iconSize} />;
      break;
  }

  return (
    <div
      className={cn(
        'bg-raised rounded-full inline-flex items-center gap-2 px-3 text-ink',
        size === 'sm' ? 'h-6 text-12' : 'h-[22px] text-13',
      )}
    >
      <span className={cn('inline-flex', statusTextClass(statusToken))}>{icon}</span>
      <span>{displayLabel}</span>
    </div>
  );
}
