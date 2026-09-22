import { useEffect, useRef, useState, useMemo } from 'react';
import { Copy, Download } from 'lucide-react';
import type { ResourceSummary } from '@cc/shared';
import { IconButton, Select, Input } from '@/ui';
import { useLogs } from '@/api/hooks';

interface LogViewerProps {
  resource: ResourceSummary;
  height?: number | string;
}

export function LogViewer({ resource, height = 'calc(100vh - 200px)' }: LogViewerProps) {
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [lines, setLines] = useState(200);
  const [follow, setFollow] = useState(false);
  const [filter, setFilter] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const { data } = useLogs(resource.uuid, {
    lines,
    container: selectedContainer || undefined,
    follow,
  });

  // Auto-select first container if not selected
  useEffect(() => {
    if (resource.containers.length > 0 && !selectedContainer) {
      const running = resource.containers.find((c) => c.state === 'running');
      setSelectedContainer(running?.name || resource.containers[0].name);
    }
  }, [resource, selectedContainer]);

  // Auto-scroll to bottom when new logs arrive and user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUp && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data, userScrolledUp]);

  const filteredLines = useMemo(() => {
    if (!data?.lines) return [];
    return data.lines.filter((line) => {
      const text = line.text.toLowerCase();
      const filterMatch = !filter || text.includes(filter.toLowerCase());
      const errorMatch = !errorsOnly || /\b(error|err|fatal|panic|exception|critical)\b/i.test(line.text);
      return filterMatch && errorMatch;
    });
  }, [data?.lines, filter, errorsOnly]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setUserScrolledUp(!isAtBottom);
  };

  const handleCopy = () => {
    const text = filteredLines.map((l) => `${l.ts || 'n/a'} ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const text = filteredLines.map((l) => `${l.ts || 'n/a'} ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resource.name}-logs.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data?.lines || data.lines.length === 0) {
    return (
      <div
        className="flex flex-col h-full bg-sunken rounded-panel"
        style={{ height }}
      >
        <div className="p-4 border-b border-rule space-y-3">
          <div className="flex gap-2">
            {resource.containers.length > 1 && (
              <Select
                value={selectedContainer || ''}
                onChange={(v: string) => setSelectedContainer(v)}
                options={resource.containers.map((c) => ({
                  value: c.name,
                  label: c.name,
                }))}
              />
            )}
            <Select
              value={String(lines)}
              onChange={(v: string) => setLines(Number(v))}
              options={[
                { value: '100', label: '100 lines' },
                { value: '200', label: '200 lines' },
                { value: '500', label: '500 lines' },
                { value: '1000', label: '1000 lines' },
                { value: '2000', label: '2000 lines' },
              ]}
            />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-ink-3">
          No log lines yet.
        </div>
        <div className="p-2 border-t border-rule text-xs text-ink-3">
          via {data?.source === 'connector' ? 'connector' : 'Coolify API'}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-sunken rounded-panel overflow-hidden"
      style={{ height }}
    >
      {/* Toolbar */}
      <div className="border-b border-rule p-3 space-y-3">
        <div className="flex gap-2">
          {resource.containers.length > 1 && (
            <Select
              value={selectedContainer || ''}
              onChange={(v: string) => setSelectedContainer(v)}
              options={resource.containers.map((c) => ({
                value: c.name,
                label: c.name,
              }))}
            />
          )}
          <Select
            value={String(lines)}
            onChange={(v: string) => setLines(Number(v))}
            options={[
              { value: '100', label: '100 lines' },
              { value: '200', label: '200 lines' },
              { value: '500', label: '500 lines' },
              { value: '1000', label: '1000 lines' },
              { value: '2000', label: '2000 lines' },
            ]}
          />
          <button
            onClick={() => setFollow(!follow)}
            className={`px-3 py-1 rounded text-sm ${follow ? 'bg-accent text-accent-ink' : 'bg-raised text-ink'}`}
          >
            Follow
          </button>
          <div className="flex-1" />
          <IconButton icon={Copy} label="Copy" onClick={handleCopy} />
          <IconButton icon={Download} label="Download" onClick={handleDownload} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Filter logs..."
              value={filter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
            />
          </div>
          <button
            onClick={() => setErrorsOnly(!errorsOnly)}
            className={`px-3 py-1 rounded text-sm whitespace-nowrap ${errorsOnly ? 'bg-accent text-accent-ink' : 'bg-raised text-ink'}`}
          >
            Errors only
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-[12.5px] leading-5"
      >
        <div className="text-ink">
          {filteredLines.slice(-2000).map((line, idx) => {
            const isError = /\b(error|err|fatal|panic|exception|critical)\b/i.test(line.text);
            return (
              <div
                key={idx}
                className={`py-0.5 px-3 flex ${isError ? 'border-l-2 border-crit bg-crit/5' : ''}`}
              >
                <span className="text-ink-3 w-20 flex-shrink-0">
                  {line.ts ? new Date(line.ts).toLocaleTimeString('en-US', { hour12: false }) : 'n/a'}
                </span>
                <span className="flex-1">{line.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-rule px-3 py-2 text-xs text-ink-3">
        Showing {filteredLines.length} of {data?.lines.length} lines · via {data?.source === 'connector' ? 'connector' : 'Coolify API'}
      </div>
    </div>
  );
}
