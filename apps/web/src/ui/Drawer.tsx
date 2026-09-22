import { cn } from '@/lib/cn';
import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from './useFocusTrap';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  actions?: ReactNode;
  /** Pad the body like the header (default). Pass false when the content manages its own spacing. */
  padded?: boolean;
  children: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = 560,
  actions,
  padded = true,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(panelRef, open);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed top-0 right-0 bottom-0 bg-panel border-l border-rule',
          'z-50 flex flex-col transition-transform duration-150',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ width: `${width}px` }}
      >
        <div className="flex items-center justify-between p-6 border-b border-rule">
          <div className="flex-1">
            <h2 id={titleId} className="text-18 font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <p className="text-13 text-ink-2 mt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={onClose}
              className="text-ink-3 hover:text-ink transition-colors ml-2"
              aria-label="Close drawer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className={cn('flex-1 overflow-auto', padded && 'p-6')}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
