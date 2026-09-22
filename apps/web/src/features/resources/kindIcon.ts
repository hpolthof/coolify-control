import type { LucideIcon } from 'lucide-react';
import { AppWindow, Boxes, Database } from 'lucide-react';
import type { ResourceKind } from '@cc/shared';

export function kindIcon(kind: ResourceKind): LucideIcon {
  switch (kind) {
    case 'application':
      return AppWindow;
    case 'service':
      return Boxes;
    case 'database':
      return Database;
  }
}

export function kindLabel(kind: ResourceKind): string {
  switch (kind) {
    case 'application':
      return 'Application';
    case 'service':
      return 'Service';
    case 'database':
      return 'Database';
  }
}
