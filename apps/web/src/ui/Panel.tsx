import { cn } from '@/lib/cn';
import { healthToken, statusBgClass } from '@/lib/health';
import type { Health } from '@cc/shared';
import { KeyboardEvent, ReactNode } from 'react';

interface PanelProps {
  rail?: Health | null;
  pulse?: boolean;
  padded?: boolean;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
  as?: 'div' | 'section' | 'button';
}

export function Panel({
  rail,
  pulse,
  padded = true,
  className,
  children,
  onClick,
  as: Component = 'div',
}: PanelProps) {
  const showPulse = pulse || rail === 'down';
  const railColor = rail ? statusBgClass(healthToken(rail)) : '';

  const isCustomClickable = !!onClick && Component !== 'button';

  const handleKeyDown = isCustomClickable
    ? (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }
    : undefined;

  return (
    <Component
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={isCustomClickable ? 'button' : undefined}
      tabIndex={isCustomClickable ? 0 : undefined}
      className={cn(
        'bg-panel border border-rule rounded-panel relative overflow-hidden text-left',
        padded && 'p-4',
        {
          'hover:border-rule-strong cursor-pointer': !!onClick,
          '[&:disabled]:opacity-50': Component === 'button',
        },
        className,
      )}
    >
      {rail && (
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1 pointer-events-none',
            railColor,
            showPulse && 'animate-rail-pulse',
          )}
        />
      )}
      {children}
    </Component>
  );
}
