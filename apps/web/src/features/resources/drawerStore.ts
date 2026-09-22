import { create } from 'zustand';

type Tab = 'overview' | 'logs' | 'deployments';

interface ResourceDrawerState {
  openUuid: string | null;
  tab: Tab;
  open(uuid: string, tab?: Tab): void;
  close(): void;
}

export const useResourceDrawer = create<ResourceDrawerState>((set) => ({
  openUuid: null,
  tab: 'overview',
  open(uuid, tab = 'overview') {
    set({ openUuid: uuid, tab });
  },
  close() {
    set({ openUuid: null, tab: 'overview' });
  },
}));
