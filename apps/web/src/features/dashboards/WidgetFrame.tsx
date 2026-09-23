import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Widget } from '@cc/shared';
import { GripVertical, RotateCw, SlidersHorizontal, X } from 'lucide-react';
import { renderWidget, widgetTitle } from './widgets/registry';
import { IconButton } from '@/ui/Button';
import { useSnapshot } from '@/live/snapshot';

interface WidgetFrameProps {
  widget: Widget;
  editing: boolean;
  onConfigure(w: Widget): void;
  onRemove(i: string): void;
  onResetScale?(i: string): void;
}

export function WidgetFrame({
  widget,
  editing,
  onConfigure,
  onRemove,
  onResetScale,
}: WidgetFrameProps) {
  const snapshot = useSnapshot();
  const title = widgetTitle(widget, snapshot);
  const scale = widget.config.scale ?? 1;

  return (
    <div
      className={`h-full w-full flex flex-col ${
        editing ? 'border-2 border-dashed border-rule-strong' : ''
      }`}
    >
      {editing && (
        <div className="h-7 bg-raised/90 flex items-center gap-2 px-2 border-b border-rule flex-shrink-0">
          <GripVertical
            className="widget-drag-handle cursor-move flex-shrink-0"
            size={18}
          />
          <span className="text-13 text-ink-2 flex-1 truncate">{title}</span>
          {scale !== 1 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="num text-12 text-ink-3">{Math.round(scale * 100)}%</span>
              <IconButton
                icon={RotateCw}
                label="Reset scale to 100%"
                size="sm"
                variant="ghost"
                onClick={() => onResetScale?.(widget.i)}
              />
            </div>
          )}
          <IconButton
            icon={SlidersHorizontal}
            label="Configure"
            size="sm"
            variant="ghost"
            onClick={() => onConfigure(widget)}
          />
          <IconButton
            icon={X}
            label="Remove"
            size="sm"
            variant="ghost"
            onClick={() => onRemove(widget.i)}
          />
        </div>
      )}
      <div
        className={`flex-1 overflow-auto ${editing ? 'pointer-events-none' : ''}`}
      >
        {scale !== 1 ? (
          <ScaledContent scale={scale}>{renderWidget(widget, { editing })}</ScaledContent>
        ) : (
          renderWidget(widget, { editing })
        )}
      </div>
    </div>
  );
}

/**
 * Zooms widget content like scaling an object in Canva: the content renders at `scale`, but the
 * box still fills the cell exactly. `zoom` only multiplies absolute lengths in this browser (not
 * percentages resolved against the parent — confirmed empirically), so the inner box needs its
 * pixel size measured and divided by `scale`, not a `${100 / scale}%` CSS trick.
 */
function ScaledContent({ scale, children }: { scale: number; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      {size && size.width > 0 && size.height > 0 && (
        <div style={{ zoom: scale, width: `${size.width / scale}px`, height: `${size.height / scale}px` }}>
          {children}
        </div>
      )}
    </div>
  );
}
