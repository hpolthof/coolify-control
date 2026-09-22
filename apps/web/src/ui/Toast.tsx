import { cn } from '@/lib/cn';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

export type ToastLevel = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  level: ToastLevel;
  message: string;
}

interface ToastStore {
  messages: ToastMessage[];
  add: (level: ToastLevel, message: string) => void;
  remove: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  messages: [],
  add: (level, message) => {
    const id = Math.random().toString(36).slice(2, 11);
    set((state) => ({
      messages: [...state.messages, { id, level, message }],
    }));
  },
  remove: (id) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },
}));

export const toast = {
  success: (message: string) =>
    useToastStore.getState().add('success', message),
  error: (message: string) =>
    useToastStore.getState().add('error', message),
  info: (message: string) =>
    useToastStore.getState().add('info', message),
};

interface ToastItemProps {
  message: ToastMessage;
  onRemove: (id: string) => void;
}

function ToastItem({ message, onRemove }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(message.id), 5000);
    return () => clearTimeout(timer);
  }, [message.id, onRemove]);

  let icon = null;
  let bgColor = 'bg-raised';

  switch (message.level) {
    case 'success':
      icon = <CheckCircle2 size={20} className="text-good" />;
      bgColor = 'bg-good/10 border border-good/30';
      break;
    case 'error':
      icon = <AlertCircle size={20} className="text-crit" />;
      bgColor = 'bg-crit/10 border border-crit/30';
      break;
    case 'info':
      icon = <Info size={20} className="text-accent" />;
      bgColor = 'bg-accent/10 border border-accent/30';
      break;
  }

  return (
    <div
      className={cn(
        'rounded-control px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2',
        'max-w-xs text-ink text-13',
        bgColor,
      )}
    >
      {icon}
      <span className="flex-1">{message.message}</span>
      <button
        onClick={() => onRemove(message.id)}
        className="text-ink-3 hover:text-ink transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function Toaster() {
  const { messages, remove } = useToastStore();

  return createPortal(
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50 pointer-events-auto">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onRemove={remove} />
      ))}
    </div>,
    document.body,
  );
}
