import type { Widget } from '@cc/shared';
import { GripVertical, SlidersHorizontal, X } from 'lucide-react';
import { renderWidget, widgetTitle } from './widgets/registry';
import { IconButton } from '@/ui/Button';
import { useSnapshot } from '@/live/snapshot';

interface WidgetFrameProps {
  widget: Widget;
  editing: boolean;
  onConfigure(w: Widget): void;
  onRemove(i: string): void;
}

export function WidgetFrame({
  widget,
  editing,
  onConfigure,
  onRemove,
}: WidgetFrameProps) {
  const snapshot = useSnapshot();
  const title = widgetTitle(widget, snapshot);

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
        {renderWidget(widget, { editing })}
      </div>
    </div>
  );
}
