import type { FC } from 'react';
import { Panel } from '@/ui/Panel';
import { HelpCircle } from 'lucide-react';

interface MissingWidgetProps {
  kind: 'server' | 'resource' | 'project';
  title?: string;
}

const MESSAGES: Record<string, string> = {
  server: 'This server is no longer in Coolify.',
  resource: 'This resource is no longer in Coolify.',
  project: 'This project is no longer in Coolify.',
};

export const MissingWidget: FC<MissingWidgetProps> = ({ kind, title }) => {
  return (
    <Panel className="h-full w-full flex flex-col items-center justify-center gap-3">
      <HelpCircle className="w-8 h-8 text-ink-3" />
      <div className="text-center">
        <div className="text-ink-2 text-sm font-medium mb-1">Missing {kind}</div>
        <div className="text-ink-3 text-xs">{MESSAGES[kind]}</div>
      </div>
    </Panel>
  );
};
