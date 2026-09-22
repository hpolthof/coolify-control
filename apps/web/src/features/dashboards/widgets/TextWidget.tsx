import type { FC, ReactNode } from 'react';
import { Panel } from '@/ui/Panel';

interface TextWidgetProps {
  text?: string;
  title?: string;
}

function parseMarkdownLite(text: string): ReactNode[] {
  const lines = text.split('\n');
  const result: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading lines start with #
    if (line.startsWith('# ')) {
      result.push(
        <div key={i} className="text-ink text-base font-semibold mt-3 mb-2">
          {parseBold(line.slice(2))}
        </div>
      );
      continue;
    }

    // Parse bold **text** within the line
    result.push(
      <div key={i} className="text-ink text-sm leading-relaxed">
        {parseBold(line)}
      </div>
    );
  }

  return result;
}

function parseBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="font-semibold">
        {match[1]}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export const TextWidget: FC<TextWidgetProps> = ({ text = '', title }) => {
  return (
    <Panel className="h-full w-full flex flex-col gap-3 overflow-auto">
      {title && <div className="text-ink-2 text-sm font-medium">{title}</div>}

      <div className="flex-1 overflow-auto whitespace-pre-wrap break-words">
        {text.trim() ? parseMarkdownLite(text) : <div className="text-ink-3 text-sm">No text</div>}
      </div>
    </Panel>
  );
};
