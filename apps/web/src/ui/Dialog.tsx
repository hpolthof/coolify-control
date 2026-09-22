import { cn } from '@/lib/cn';
import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from './useFocusTrap';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'md',
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const widthClass = {
    sm: 'w-96',
    md: 'w-[500px]',
    lg: 'w-[700px]',
  }[width];

  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'bg-raised rounded-panel border border-rule shadow-lg',
          'flex flex-col max-h-[90vh]',
          widthClass,
        )}
      >
        <div className="flex items-center justify-between p-6 border-b border-rule">
          <h2 id={titleId} className="text-18 font-semibold text-ink">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink transition-colors"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-rule">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
