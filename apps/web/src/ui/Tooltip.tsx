import { cn } from '@/lib/cn';
import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

const GAP = 6;
const EDGE = 8;

/**
 * Hover/focus tooltip. Rendered in a portal with fixed positioning so cards with `overflow: hidden`
 * can't clip it; shown above the trigger, or below when there is no room above.
 */
export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const above = t.top - GAP - tip.height;
    const top = above >= EDGE ? above : t.bottom + GAP;
    const left = Math.min(Math.max(EDGE, t.left + t.width / 2 - tip.width / 2), window.innerWidth - tip.width - EDGE);
    setPos({ top, left });
  }, [open, content]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setPos(null);
  };

  return (
    <div
      ref={triggerRef}
      className={cn('relative inline-block', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        content != null &&
        content !== '' &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            className="fixed z-[80] max-w-80 px-2 py-1 bg-raised border border-rule-strong rounded-control text-12 text-ink pointer-events-none break-words"
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
