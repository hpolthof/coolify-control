import { cn } from '@/lib/cn';
import { ReactNode, useState } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block group">
      {children}
      {isVisible && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-raised border border-rule rounded-control whitespace-nowrap text-12 text-ink pointer-events-none z-50">
          {content}
        </div>
      )}
    </div>
  );
}
