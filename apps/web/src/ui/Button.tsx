import { cn } from '@/lib/cn';
import { LucideIcon } from 'lucide-react';
import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const height = size === 'sm' ? 'h-7' : 'h-8';
  const fontSize = size === 'sm' ? 'text-13' : 'text-15';

  const variantClass = {
    primary: 'bg-accent text-accent-ink hover:bg-accent-strong',
    secondary: 'bg-raised border border-rule hover:bg-raised/80',
    ghost: 'transparent hover:bg-raised',
    danger:
      'bg-crit/15 text-ink border border-crit/50 hover:bg-crit/25',
  }[variant];

  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'px-3 rounded-control font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50',
        height,
        fontSize,
        variantClass,
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={16} /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: IconButtonProps) {
  const dimension = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';

  const variantClass = {
    primary: 'bg-accent text-accent-ink hover:bg-accent-strong',
    secondary: 'bg-raised border border-rule hover:bg-raised/80',
    ghost: 'transparent hover:bg-raised',
    danger:
      'bg-crit/15 text-ink border border-crit/50 hover:bg-crit/25',
  }[variant];

  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'rounded-control inline-flex items-center justify-center transition-colors',
        dimension,
        variantClass,
        className,
      )}
      {...props}
    >
      <Icon size={16} />
    </button>
  );
}
