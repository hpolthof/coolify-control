import { cn } from '@/lib/cn';
import { LucideIcon } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}

const GAP = 4;
const EDGE = 8;

/**
 * Dropdown menu. The list renders in a portal with fixed positioning so it is never clipped by a parent with
 * `overflow: hidden` (cards, tables, drawers). It opens below the trigger, or above when there is no room.
 */
export function Menu({ trigger, items, align = 'end' }: MenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setPos(null);
  }, []);

  // Position after the list has rendered, so its real size is known.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !listRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const l = listRef.current.getBoundingClientRect();
    const below = t.bottom + GAP;
    const top = below + l.height > window.innerHeight - EDGE && t.top - GAP - l.height >= EDGE ? t.top - GAP - l.height : below;
    const rawLeft = align === 'start' ? t.left : t.right - l.width;
    const left = Math.min(Math.max(EDGE, rawLeft), window.innerWidth - l.width - EDGE);
    setPos({ top, left });
  }, [isOpen, align, items.length]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const item = items[highlightedIndex];
        if (item && !item.disabled) {
          item.onSelect();
          close();
        }
      }
    }

    // A fixed-position list would drift away from its trigger on scroll or resize; just close it.
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      close();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, items, highlightedIndex, close]);

  return (
    <div className="relative inline-block" ref={triggerRef}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) close();
          else {
            setHighlightedIndex(0);
            setIsOpen(true);
          }
        }}
      >
        {trigger}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            role="menu"
            // Hidden until measured, so it never flashes at the wrong spot.
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            className="fixed z-[70] min-w-40 max-w-[calc(100vw-16px)] py-1 bg-raised border border-rule-strong rounded-control"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, idx) => (
              <button
                key={idx}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (!item.disabled) {
                    item.onSelect();
                    close();
                  }
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                disabled={item.disabled}
                className={cn(
                  'w-full px-3 py-2 text-left text-13 flex items-center gap-2 whitespace-nowrap',
                  item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  item.danger ? 'text-crit' : 'text-ink',
                  idx === highlightedIndex && !item.disabled && 'bg-rule',
                )}
              >
                {item.icon && <item.icon size={16} className={item.danger ? 'text-crit' : 'text-ink-2'} />}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
