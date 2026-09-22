import { cn } from '@/lib/cn';
import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      {Icon && (
        <div className="text-ink-3">
          <Icon size={48} />
        </div>
      )}
      <div>
        <h2 className="text-18 font-semibold text-ink mb-2">{title}</h2>
        {body && <p className="text-ink-2">{body}</p>}
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
